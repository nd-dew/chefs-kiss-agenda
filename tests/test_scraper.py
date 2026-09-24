from oxp_agenda import scraper

CARD = """<div class="o_we_agenda_card_title"><a href="/event/x/track/{slug}">{title}</a></div>
<div class="opacity-75 text-center"><small>{speaker}</small></div>
<span class="badge text-bg-light">AI</span><span class="badge">English</span>"""

TABLE = """<tr><th></th><th>Room A</th><th>Room B</th></tr>
<tr><td>09:00</td><td class="event_track" rowspan="2">{a}</td><td class="event_track">{b}</td></tr>
<tr><td>09:15</td><td></td></tr>
<tr><td>09:30</td><td class="event_track" colspan="2">{c}</td></tr>""".format(
    a=CARD.format(slug='a', title='Talk &amp; A', speaker='Ann Lee, CEO at X'),
    b=CARD.format(slug='b', title='Talk B', speaker='Bob'),
    c=CARD.format(slug='c', title='Keynote', speaker=''),
)
DAY = {
    'date': '2026-09-24',
    'label': 'Thursday, Sep 24',
    'short_label': 'Thu Sep 24',
    'is_masterclass': False,
    'start_min': 9 * 60,
    'table_idx': 3,
}


def test_parse_day_handles_rowspan_and_colspan():
    a, b, c = scraper.parse_day(TABLE, DAY)
    assert (a['title'], a['start_time'], a['end_time'], a['rooms']) == ('Talk & A', '09:00', '09:30', ['Room A'])
    assert (a['speaker'], a['speaker_role'], a['badges']) == ('Ann Lee', 'CEO at X', ['AI', 'English'])
    assert (b['rooms'], b['duration_min']) == (['Room B'], 15)
    # The 09:15 row only has a cell for Room B: Room A is still covered by the rowspan.
    assert (c['start_time'], c['rooms'], c['room_str']) == ('09:30', ['Room A', 'Room B'], 'Room A, Room B')
    assert [t['id'] for t in (a, b, c)] == [
        'track_2026-09-24_0900_1_0',
        'track_2026-09-24_0900_2_1',
        'track_2026-09-24_0930_1_2',
    ]


def test_days_table_matches_labels():
    assert scraper.DAYS[2] == DAY | {'start_min': 7 * 60 + 30}


def test_clean_html_keeps_paragraphs_and_drops_a_cut_off_tag():
    assert scraper.clean_html('<p>One &amp; two</p><p>Three<br>four</p>\n<div') == 'One & two\nThree\nfour'


def test_parse_track_page_splits_bio_and_description():
    html = """<img src="https://odoocdn.com/web/image/event.track/1/image/96x0/x">
    <div data-youtube-video-id="yt123"></div>
    <div class="o_wesession_track_main_description">
      <div class="oe_no_empty">Speaker bio.</div><hr/>
      <p>What you will learn.</p>
    </div><div id="oe_structure_wesession_track_index_2"></div>"""
    page = scraper.parse_track_page(html)
    assert page == {
        'youtube_id': 'yt123',
        'speaker_avatar': 'https://odoocdn.com/web/image/event.track/1/image/96x0/x',
        'description': 'What you will learn.',
        'speaker_bio': 'Speaker bio.',
    }


def test_page_cache_names_fit_the_filesystem(tmp_path):
    cache = scraper.PageCache(tmp_path)
    long_url = '/event/oxp/track/' + 'very-long-slug-' * 40
    path = cache.path_for(long_url)
    assert len(path.name) <= scraper.MAX_NAME + len('.html')
    assert path != cache.path_for(long_url + 'x')  # the hash keeps them distinct
    assert cache.path_for('https://www.odoo.com/event/a').name == 'event_a.html'


def test_page_cache_reads_cached_pages_without_network(tmp_path):
    cache = scraper.PageCache(tmp_path)
    cache.path_for('/event/a').write_text('<html>cached</html>')
    assert cache.get('/event/a') == '<html>cached</html>'
