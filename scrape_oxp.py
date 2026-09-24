#!/usr/bin/env python3
import concurrent.futures
from html import unescape
import json
import os
import re
import sys
import time
import urllib.request

HTML_PATH = '/tmp/oxp_agenda.html'
CACHE_DIR = '/tmp/oxp_track_cache'
OUTPUT_PATH = '/home/odoo/repos/oxp-agenda/data/agenda.json'

os.makedirs(CACHE_DIR, exist_ok=True)

if not os.path.exists(HTML_PATH):
    print(f"Error: {HTML_PATH} does not exist")
    sys.exit(1)

with open(HTML_PATH, 'r', encoding='utf-8') as f:
    html = f.read()

table_splits = re.split(r'<table id=\"table_search\"', html)

days = [
    {'date': '2026-09-22', 'label': 'Tuesday, Sep 22', 'short_label': 'Tue Sep 22', 'is_masterclass': True, 'start_min': 9 * 60, 'table_idx': 1},
    {'date': '2026-09-23', 'label': 'Wednesday, Sep 23', 'short_label': 'Wed Sep 23', 'is_masterclass': True, 'start_min': 9 * 60, 'table_idx': 2},
    {'date': '2026-09-24', 'label': 'Thursday, Sep 24', 'short_label': 'Thu Sep 24', 'is_masterclass': False, 'start_min': 7 * 60 + 30, 'table_idx': 3},
    {'date': '2026-09-25', 'label': 'Friday, Sep 25', 'short_label': 'Fri Sep 25', 'is_masterclass': False, 'start_min': 7 * 60 + 30, 'table_idx': 4},
    {'date': '2026-09-26', 'label': 'Saturday, Sep 26', 'short_label': 'Sat Sep 26', 'is_masterclass': False, 'start_min': 8 * 60, 'table_idx': 5},
]

all_tracks = []
unique_urls = set()
track_counter = 0

for d in days:
    t_html = table_splits[d['table_idx']].split('</table>')[0]
    rows = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', t_html)
    
    # Extract rooms from header
    header = rows[0]
    ths = re.findall(r'<th[^>]*>([\s\S]*?)</th>', header)
    rooms = []
    for th in ths:
        r_name = re.sub(r'<[^>]+>', '', th).strip()
        if r_name:
            rooms.append(unescape(r_name))
            
    if not rooms:
        # Table 0 & 1: Masterclasses
        rooms = [f'Masterclass Room {i+1}' for i in range(8)]
        
    grid = set()
    day_tracks = []
    
    for r_idx, row_html in enumerate(rows[1:]):
        td_matches = list(re.finditer(r'<td([^>]*)>([\s\S]*?)</td>', row_html))
        col_idx = 0
        
        for m in td_matches:
            td_attrs = m.group(1)
            td_inner = m.group(2)
            
            while (r_idx, col_idx) in grid:
                col_idx += 1
                
            rs_m = re.search(r'rowspan=\"(\d+)\"', td_attrs)
            cs_m = re.search(r'colspan=\"(\d+)\"', td_attrs)
            rowspan = int(rs_m.group(1)) if rs_m else 1
            colspan = int(cs_m.group(1)) if cs_m else 1
            
            for r in range(r_idx, r_idx + rowspan):
                for c in range(col_idx, col_idx + colspan):
                    grid.add((r, c))
                    
            if col_idx > 0 and 'event_track' in td_attrs:
                start_min = d['start_min'] + r_idx * 15
                dur_min = rowspan * 15
                end_min = start_min + dur_min
                
                start_str = f'{start_min // 60:02d}:{start_min % 60:02d}'
                end_str = f'{end_min // 60:02d}:{end_min % 60:02d}'
                
                room_start_idx = col_idx - 1
                room_end_idx = room_start_idx + colspan
                assigned_rooms = rooms[room_start_idx:room_end_idx] if room_start_idx < len(rooms) else ['General']
                
                # Title & link
                title_m = re.search(r'class=\"o_we_agenda_card_title[^\"]*\"[\s\S]*?(?:<a[^>]*href=\"([^\"]*)\"[^>]*>|<span[^>]*>)([\s\S]*?)(?:</a>|</span>)', td_inner)
                url = ''
                title = ''
                if title_m:
                    url = title_m.group(1) or ''
                    title = unescape(re.sub(r'<[^>]+>', '', title_m.group(2)).strip())
                else:
                    title = 'Untitled'
                    
                title = re.sub(r'\s+', ' ', title).strip()
                
                # Speaker & role
                speaker_m = re.search(r'<div class=\"opacity-75 text-center\">[\s\S]*?<small>([\s\S]*?)</small>', td_inner)
                speaker_raw = unescape(re.sub(r'<[^>]+>', '', speaker_m.group(1)).strip()) if speaker_m else ''
                speaker_name = ''
                speaker_role = ''
                if speaker_raw:
                    parts = speaker_raw.split(',', 1)
                    speaker_name = parts[0].strip()
                    speaker_role = parts[1].strip() if len(parts) > 1 else ''
                
                # Badges / Tags
                badges = []
                badge_matches = re.findall(r'<span[^>]*class=\"[^\"]*badge[^\"]*\"[^>]*>([\s\S]*?)</span>', td_inner)
                for b in badge_matches:
                    clean_b = unescape(re.sub(r'<[^>]+>', '', b).strip())
                    if clean_b and clean_b not in badges:
                        badges.append(clean_b)
                        
                track_id = f"track_{d['date']}_{start_str.replace(':', '')}_{col_idx}_{track_counter}"
                track_counter += 1
                
                track_item = {
                    'id': track_id,
                    'title': title,
                    'url': url,
                    'speaker': speaker_name,
                    'speaker_role': speaker_role,
                    'speaker_raw': speaker_raw,
                    'speaker_avatar': '',
                    'speaker_bio': '',
                    'description': '',
                    'youtube_id': '',
                    'day': d['date'],
                    'day_label': d['label'],
                    'short_label': d['short_label'],
                    'is_masterclass': d['is_masterclass'],
                    'start_time': start_str,
                    'end_time': end_str,
                    'duration_min': dur_min,
                    'rooms': assigned_rooms,
                    'room_str': ', '.join(assigned_rooms),
                    'badges': badges
                }
                
                if url:
                    unique_urls.add(url)
                    
                day_tracks.append(track_item)
                all_tracks.append(track_item)
            
            col_idx += colspan

print(f"Total tracks parsed: {len(all_tracks)}")
print(f"Total unique detail URLs: {len(unique_urls)}")

def clean_html(raw):
    if not raw:
        return ''
    text = re.sub(r'<(script|style)[^>]*>[\s\S]*?</\1>', ' ', raw)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'</p>', '\n\n', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = unescape(text)
    lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n')]
    return '\n'.join([l for l in lines if l]).strip()

def fetch_url(url_path):
    safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', url_path.strip('/')) + '.html'
    cached_file = os.path.join(CACHE_DIR, safe_name)
    
    content = None
    if os.path.exists(cached_file):
        try:
            with open(cached_file, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            pass
            
    if content is None:
        full_url = f"https://www.odoo.com{url_path}" if url_path.startswith('/') else url_path
        req = urllib.request.Request(full_url, headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        })
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                content = resp.read().decode('utf-8', errors='ignore')
                with open(cached_file, 'w', encoding='utf-8') as cf:
                    cf.write(content)
        except Exception as e:
            return url_path, {'error': str(e), 'youtube_id': '', 'avatar': '', 'description': '', 'bio': ''}
            
    # YouTube ID
    yt = re.search(r'data-youtube-video-id=\"([^\"]+)\"', content)
    yt_id = yt.group(1) if yt else ''
    
    # Speaker avatar
    avatar_m = re.search(r'<img[^>]+src=\"(https://odoocdn\.com/web/image/event\.track/[^\"]+)\"', content)
    avatar_url = avatar_m.group(1) if avatar_m else ''
    
    # Parse main block
    desc_idx = content.find('class="o_wesession_track_main_description')
    end_idx = content.find('id="oe_structure_wesession_track_index_2', desc_idx)
    block = content[desc_idx:end_idx] if (desc_idx != -1 and end_idx != -1) else ''
    
    bio_text = ''
    desc_text = ''
    
    if block:
        # Check if there is an <hr>
        if '<hr' in block:
            parts = re.split(r'<hr[^>]*>', block, maxsplit=1)
            # bio is in parts[0]
            bio_matches = re.findall(r'<div class=\"oe_no_empty\">([\s\S]*?)</div>', parts[0])
            if bio_matches:
                bio_text = clean_html(bio_matches[-1])
            # desc is in parts[1]
            desc_text = clean_html(parts[1])
        else:
            # Without <hr>, e.g. masterclass or single block
            # Look for oe_no_empty
            empty_divs = re.findall(r'<div class=\"(?:my-2\s+)?oe_no_empty\">([\s\S]*?)</div>', block)
            if empty_divs:
                desc_text = clean_html('\n\n'.join(empty_divs))
            else:
                # Fallback: strip header block
                header_end = block.find('</div>\n            </div>')
                if header_end != -1:
                    desc_text = clean_html(block[header_end+22:])
                else:
                    desc_text = clean_html(block)

    return url_path, {
        'youtube_id': yt_id,
        'avatar': avatar_url,
        'description': desc_text,
        'bio': bio_text
    }

print("Fetching and extracting track details...")
t0 = time.time()
url_details_cache = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=25) as executor:
    results = executor.map(fetch_url, unique_urls)
    completed = 0
    for u_path, details in results:
        completed += 1
        url_details_cache[u_path] = details
        if completed % 100 == 0 or completed == len(unique_urls):
            print(f"  [{completed}/{len(unique_urls)}] processed...")

t1 = time.time()
print(f"Extraction completed in {t1 - t0:.2f}s")

for t in all_tracks:
    if t['url'] and t['url'] in url_details_cache:
        d_info = url_details_cache[t['url']]
        if d_info.get('youtube_id'):
            t['youtube_id'] = d_info['youtube_id']
        if d_info.get('avatar'):
            t['speaker_avatar'] = d_info['avatar']
        if d_info.get('description'):
            t['description'] = d_info['description']
        if d_info.get('bio'):
            t['speaker_bio'] = d_info['bio']

all_rooms = sorted(list(set(r for t in all_tracks for r in t['rooms'])))
all_badges = sorted(list(set(b for t in all_tracks for b in t['badges'])))

output_data = {
    'event_title': 'Odoo Experience 2026',
    'location': 'Brussels Expo, Belgium',
    'timezone': 'Europe/Brussels',
    'total_tracks': len(all_tracks),
    'days': days,
    'rooms': all_rooms,
    'badges': all_badges,
    'tracks': all_tracks
}

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, indent=2, ensure_ascii=False)

print(f"Saved {len(all_tracks)} tracks to {OUTPUT_PATH}")
