/**
 * Odoo Experience 2026 — Interactive Agenda & Personal Schedule Explorer
 * Vanilla ES6+ Application Logic
 */

(function () {
  'use strict';

  // --- App State ---
  const state = {
    allTracks: [],
    days: [],
    rooms: [],
    badges: [],
    activeDay: '2026-09-24', // Default to Thursday (Day 1 Keynote)
    activeView: 'timeline',   // 'timeline' | 'grid' | 'by_room' | 'favorites'
    searchQuery: '',
    selectedCategory: 'all',
    selectedRoom: 'all',
    selectedTag: 'all',
    videoOnly: false,
    selectedRoomDetail: '',
    favorites: new Set(),
    activeModalTrack: null,
  };

  // --- Topic Categories Configuration ---
  const CATEGORIES = [
    { id: 'all', label: 'All Sessions', icon: '✨' },
    { id: 'keynote', label: 'Keynotes', icon: '⭐', test: t => /keynote|unveiling|opening/i.test(t.title) },
    { id: 'dev', label: 'Developers', icon: '💻', test: t => /developer|code|framework|api|python|orm|owl|technical/i.test(t.title) || t.badges.some(b => /developer|technical/i.test(b)) },
    { id: 'ai', label: 'AI & Machine Learning', icon: '🤖', test: t => /\bai\b|artificial intelligence|gpt|llm|copilot/i.test(t.title) || t.badges.some(b => /\bai\b/i.test(b)) },
    { id: 'accounting', label: 'Accounting & Finance', icon: '📊', test: t => /accounting|finance|invoice|invoicing|bank|tax/i.test(t.title) || t.badges.some(b => /accounting|finance|invoicing/i.test(b)) },
    { id: 'sales', label: 'Sales & CRM', icon: '💼', test: t => /sales|crm|lead|pos|retail/i.test(t.title) || t.badges.some(b => /sales|crm|pos/i.test(b)) },
    { id: 'logistics', label: 'Logistics & MRP', icon: '📦', test: t => /inventory|warehouse|wms|mrp|manufacturing|supply chain/i.test(t.title) || t.badges.some(b => /inventory|mrp|manufacturing/i.test(b)) },
    { id: 'masterclass', label: 'Masterclasses', icon: '🎓', test: t => t.is_masterclass || /masterclass/i.test(t.title) },
    { id: 'concert', label: 'Social & Concerts', icon: '🎉', test: t => /concert|band|party|beer|dinner|awards/i.test(t.title) },
    { id: 'community', label: 'Community', icon: '👥', test: t => t.badges.some(b => /community/i.test(b)) || /partner|community/i.test(t.title) },
  ];

  // --- DOM Elements ---
  const dom = {
    body: document.body,
    totalTalksCount: document.getElementById('totalTalksCount'),
    favoritesCount: document.getElementById('favoritesCount'),
    myScheduleBtn: document.getElementById('myScheduleBtn'),
    exportMenuBtn: document.getElementById('exportMenuBtn'),
    exportDropdown: document.getElementById('exportDropdown'),
    exportIcsFavorites: document.getElementById('exportIcsFavorites'),
    exportIcsAll: document.getElementById('exportIcsAll'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    daysBar: document.getElementById('daysBar'),
    viewButtons: document.querySelectorAll('.view-btn'),
    searchInput: document.getElementById('searchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    chipsContainer: document.getElementById('chipsContainer'),
    roomSelect: document.getElementById('roomSelect'),
    tagSelect: document.getElementById('tagSelect'),
    videoOnlyCheck: document.getElementById('videoOnlyCheck'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    emptyResetBtn: document.getElementById('emptyResetBtn'),
    timelineContainer: document.getElementById('timelineContainer'),
    gridContainer: document.getElementById('gridContainer'),
    byRoomContainer: document.getElementById('byRoomContainer'),
    favoritesContainer: document.getElementById('favoritesContainer'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalVideoContainer: document.getElementById('modalVideoContainer'),
    modalVideoIframe: document.getElementById('modalVideoIframe'),
    modalTitle: document.getElementById('modalTitle'),
    modalBadges: document.getElementById('modalBadges'),
    modalDateTime: document.getElementById('modalDateTime'),
    modalLocation: document.getElementById('modalLocation'),
    modalDuration: document.getElementById('modalDuration'),
    modalSpeakerCard: document.getElementById('modalSpeakerCard'),
    modalSpeakerAvatar: document.getElementById('modalSpeakerAvatar'),
    modalSpeakerName: document.getElementById('modalSpeakerName'),
    modalSpeakerRole: document.getElementById('modalSpeakerRole'),
    modalSpeakerBio: document.getElementById('modalSpeakerBio'),
    modalDescription: document.getElementById('modalDescription'),
    modalFavBtn: document.getElementById('modalFavBtn'),
    modalFavText: document.getElementById('modalFavText'),
    modalGcalBtn: document.getElementById('modalGcalBtn'),
    modalIcsBtn: document.getElementById('modalIcsBtn'),
    modalOdooLinkBtn: document.getElementById('modalOdooLinkBtn'),
    modalShareBtn: document.getElementById('modalShareBtn'),
    scrollTopBtn: document.getElementById('scrollTopBtn'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // --- Initialize App ---
  async function init() {
    loadTheme();
    loadFavorites();
    setupEventListeners();
    await loadAgendaData();
  }

  // --- Load Data ---
  async function loadAgendaData() {
    try {
      // Try minified data first, fallback to standard agenda.json
      let response = await fetch('data/agenda.min.json');
      if (!response.ok) {
        response = await fetch('data/agenda.json');
      }
      const data = await response.json();

      state.allTracks = data.tracks || [];
      state.days = data.days || [];
      state.rooms = data.rooms || [];
      state.badges = data.badges || [];

      dom.totalTalksCount.textContent = state.allTracks.length;

      // Populate filter dropdowns & controls
      renderDayTabs();
      renderTopicChips();
      populateDropdowns();

      // Read query params if any
      parseUrlParams();

      // Hide loading state
      dom.loadingState.style.display = 'none';

      // Render view
      renderCurrentView();
    } catch (err) {
      console.error('Failed to load agenda data:', err);
      dom.loadingState.innerHTML = `
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load schedule data</h3>
        <p>Please check your network connection or try refreshing the page.</p>
        <button class="action-btn" onclick="location.reload()">Retry</button>
      `;
    }
  }

  // --- Favorites Management ---
  function loadFavorites() {
    try {
      const stored = localStorage.getItem('oxp_favorites_2026');
      if (stored) {
        state.favorites = new Set(JSON.parse(stored));
      }
    } catch (e) {
      state.favorites = new Set();
    }
    updateFavoritesBadge();
  }

  function saveFavorites() {
    try {
      localStorage.setItem('oxp_favorites_2026', JSON.stringify([...state.favorites]));
    } catch (e) {
      console.error('Failed to save favorites to localStorage:', e);
    }
    updateFavoritesBadge();
  }

  function toggleFavorite(trackId, event) {
    if (event) {
      event.stopPropagation();
    }
    const track = state.allTracks.find(t => t.id === trackId);
    const title = track ? track.title : 'Session';

    if (state.favorites.has(trackId)) {
      state.favorites.delete(trackId);
      showToast(`Removed from My Schedule`, 'info');
    } else {
      state.favorites.add(trackId);
      showToast(`Added to My Schedule: "${title.slice(0, 32)}..."`, 'success');
    }

    saveFavorites();
    updateFavoriteButtons(trackId);

    if (state.activeView === 'favorites') {
      renderCurrentView();
    }
  }

  function updateFavoritesBadge() {
    dom.favoritesCount.textContent = state.favorites.size;
  }

  function updateFavoriteButtons(trackId) {
    // Update talk cards in DOM
    document.querySelectorAll(`[data-track-id="${trackId}"]`).forEach(card => {
      const isFav = state.favorites.has(trackId);
      card.classList.toggle('is-favorite', isFav);
      const star = card.querySelector('.card-fav-btn');
      if (star) {
        star.textContent = isFav ? '★' : '☆';
      }
    });

    // Update modal button if open
    if (state.activeModalTrack && state.activeModalTrack.id === trackId) {
      const isFav = state.favorites.has(trackId);
      dom.modalFavText.textContent = isFav ? 'In My Schedule' : 'Add to My Schedule';
      dom.modalFavBtn.classList.toggle('primary', !isFav);
    }
  }

  // --- Theme Management ---
  function loadTheme() {
    const saved = localStorage.getItem('oxp_theme');
    if (saved === 'light') {
      dom.body.classList.remove('theme-dark');
      dom.body.classList.add('theme-light');
    } else {
      dom.body.classList.add('theme-dark');
      dom.body.classList.remove('theme-light');
    }
  }

  function toggleTheme() {
    if (dom.body.classList.contains('theme-dark')) {
      dom.body.classList.remove('theme-dark');
      dom.body.classList.add('theme-light');
      localStorage.setItem('oxp_theme', 'light');
    } else {
      dom.body.classList.remove('theme-light');
      dom.body.classList.add('theme-dark');
      localStorage.setItem('oxp_theme', 'dark');
    }
  }

  // --- Day Tabs ---
  function renderDayTabs() {
    let html = `
      <button class="day-tab-btn ${state.activeDay === 'all' ? 'active' : ''}" data-day="all">
        <span>All Days</span>
        <span class="day-count">${state.allTracks.length}</span>
      </button>
    `;

    state.days.forEach(d => {
      const count = state.allTracks.filter(t => t.day === d.date).length;
      html += `
        <button class="day-tab-btn ${state.activeDay === d.date ? 'active' : ''}" data-day="${d.date}">
          <span>${d.short_label}</span>
          <span class="day-count">${count}</span>
        </button>
      `;
    });

    dom.daysBar.innerHTML = html;

    dom.daysBar.querySelectorAll('.day-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeDay = btn.getAttribute('data-day');
        dom.daysBar.querySelectorAll('.day-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateUrlParams();
        renderCurrentView();
      });
    });
  }

  // --- Topic Chips ---
  function renderTopicChips() {
    let html = '';
    CATEGORIES.forEach(cat => {
      html += `
        <button class="topic-chip ${state.selectedCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
          <span>${cat.icon}</span>
          <span>${cat.label}</span>
        </button>
      `;
    });

    dom.chipsContainer.innerHTML = html;

    dom.chipsContainer.querySelectorAll('.topic-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.selectedCategory = chip.getAttribute('data-cat');
        dom.chipsContainer.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        checkActiveFilters();
        renderCurrentView();
      });
    });
  }

  // --- Dropdowns Population ---
  function populateDropdowns() {
    // Rooms
    let roomOptions = '<option value="all">All Rooms (24)</option>';
    state.rooms.forEach(r => {
      roomOptions += `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`;
    });
    dom.roomSelect.innerHTML = roomOptions;

    // Badges / Tags
    let tagOptions = '<option value="all">All Tags</option>';
    state.badges.forEach(b => {
      tagOptions += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
    });
    dom.tagSelect.innerHTML = tagOptions;
  }

  // --- Filter Logic ---
  function getFilteredTracks() {
    let tracks = state.allTracks;

    // 1. Day Filter
    if (state.activeDay !== 'all') {
      tracks = tracks.filter(t => t.day === state.activeDay);
    }

    // 2. View: My Schedule
    if (state.activeView === 'favorites') {
      tracks = tracks.filter(t => state.favorites.has(t.id));
    }

    // 3. Category Filter
    if (state.selectedCategory !== 'all') {
      const catObj = CATEGORIES.find(c => c.id === state.selectedCategory);
      if (catObj && catObj.test) {
        tracks = tracks.filter(t => catObj.test(t));
      }
    }

    // 4. Room Filter
    if (state.selectedRoom !== 'all') {
      tracks = tracks.filter(t => t.rooms.includes(state.selectedRoom));
    }

    // 5. Tag Filter
    if (state.selectedTag !== 'all') {
      tracks = tracks.filter(t => t.badges.includes(state.selectedTag));
    }

    // 6. Video Stream Filter
    if (state.videoOnly) {
      tracks = tracks.filter(t => !!t.youtube_id);
    }

    // 7. Search Query
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      tracks = tracks.filter(t => {
        return (
          t.title.toLowerCase().includes(q) ||
          t.speaker.toLowerCase().includes(q) ||
          t.speaker_role.toLowerCase().includes(q) ||
          t.room_str.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.badges.some(b => b.toLowerCase().includes(q))
        );
      });
    }

    return tracks;
  }

  function checkActiveFilters() {
    const hasActive =
      state.searchQuery.trim() !== '' ||
      state.selectedCategory !== 'all' ||
      state.selectedRoom !== 'all' ||
      state.selectedTag !== 'all' ||
      state.videoOnly;

    dom.resetFiltersBtn.style.display = hasActive ? 'inline-block' : 'none';
  }

  function resetAllFilters() {
    state.searchQuery = '';
    dom.searchInput.value = '';
    dom.searchClearBtn.style.display = 'none';

    state.selectedCategory = 'all';
    dom.chipsContainer.querySelectorAll('.topic-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-cat') === 'all');
    });

    state.selectedRoom = 'all';
    dom.roomSelect.value = 'all';

    state.selectedTag = 'all';
    dom.tagSelect.value = 'all';

    state.videoOnly = false;
    dom.videoOnlyCheck.checked = false;

    checkActiveFilters();
    renderCurrentView();
  }

  // --- Render Orchestrator ---
  function renderCurrentView() {
    const filtered = getFilteredTracks();

    // Check empty state
    if (filtered.length === 0) {
      dom.timelineContainer.style.display = 'none';
      dom.gridContainer.style.display = 'none';
      dom.byRoomContainer.style.display = 'none';
      dom.favoritesContainer.style.display = 'none';
      dom.emptyState.style.display = 'flex';
      return;
    }

    dom.emptyState.style.display = 'none';

    // Hide all view containers
    dom.timelineContainer.style.display = 'none';
    dom.gridContainer.style.display = 'none';
    dom.byRoomContainer.style.display = 'none';
    dom.favoritesContainer.style.display = 'none';

    switch (state.activeView) {
      case 'timeline':
        dom.timelineContainer.style.display = 'block';
        renderTimelineView(filtered);
        break;
      case 'grid':
        dom.gridContainer.style.display = 'block';
        renderGridView(filtered);
        break;
      case 'by_room':
        dom.byRoomContainer.style.display = 'block';
        renderByRoomView(filtered);
        break;
      case 'favorites':
        dom.favoritesContainer.style.display = 'block';
        renderFavoritesView(filtered);
        break;
    }
  }

  // --- 1. Timeline View ---
  function renderTimelineView(tracks) {
    // Group tracks by slot (day + start_time)
    const slotMap = new Map();
    tracks.forEach(t => {
      const slotKey = `${t.day} | ${t.start_time}`;
      if (!slotMap.has(slotKey)) {
        slotMap.set(slotKey, {
          day: t.day,
          dayLabel: t.day_label,
          startTime: t.start_time,
          tracks: []
        });
      }
      slotMap.get(slotKey).tracks.push(t);
    });

    // Sort slots chronologically
    const sortedSlots = Array.from(slotMap.values()).sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return a.startTime.localeCompare(b.startTime);
    });

    let html = '';
    sortedSlots.forEach(slot => {
      html += `
        <div class="timeline-slot">
          <div class="slot-header">
            <span class="slot-time-pill">${state.activeDay === 'all' ? slot.dayLabel + ' • ' : ''}${slot.startTime}</span>
            <div class="slot-divider"></div>
            <span class="slot-count">${slot.tracks.length} ${slot.tracks.length === 1 ? 'session' : 'sessions'}</span>
          </div>
          <div class="tracks-grid">
            ${slot.tracks.map(t => renderTalkCardHtml(t)).join('')}
          </div>
        </div>
      `;
    });

    dom.timelineContainer.innerHTML = html;
    attachCardListeners(dom.timelineContainer);
  }

  // --- 2. Room Grid View ---
  function renderGridView(tracks) {
    // Collect rooms active in this subset
    const targetRooms = state.selectedRoom !== 'all' 
      ? [state.selectedRoom]
      : state.rooms.filter(r => tracks.some(t => t.rooms.includes(r)));

    // Collect all distinct start times sorted
    const timesSet = new Set(tracks.map(t => t.start_time));
    const sortedTimes = Array.from(timesSet).sort();

    let html = `
      <div class="grid-view-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-th time-header-corner">Time</th>
              ${targetRooms.map(r => `<th class="matrix-th">${escapeHtml(r)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    sortedTimes.forEach(timeStr => {
      html += `<tr>`;
      html += `<td class="matrix-time-td">${timeStr}</td>`;

      targetRooms.forEach(roomName => {
        const slotTracks = tracks.filter(t => t.start_time === timeStr && t.rooms.includes(roomName));
        html += `<td class="matrix-slot-td">`;
        if (slotTracks.length > 0) {
          slotTracks.forEach(t => {
            const isFav = state.favorites.has(t.id);
            html += `
              <div class="grid-track-card" data-track-id="${t.id}" title="${escapeHtml(t.title)} (${t.duration_min}m)">
                <div class="grid-card-title">${isFav ? '★ ' : ''}${escapeHtml(t.title)}</div>
                ${t.speaker ? `<div class="grid-card-speaker">${escapeHtml(t.speaker)}</div>` : ''}
              </div>
            `;
          });
        }
        html += `</td>`;
      });

      html += `</tr>`;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    dom.gridContainer.innerHTML = html;

    dom.gridContainer.querySelectorAll('.grid-track-card').forEach(card => {
      card.addEventListener('click', () => {
        const trackId = card.getAttribute('data-track-id');
        openDetailModal(trackId);
      });
    });
  }

  // --- 3. By Room View ---
  function renderByRoomView(tracks) {
    const availableRooms = state.rooms.filter(r => tracks.some(t => t.rooms.includes(r)));
    if (!state.selectedRoomDetail || !availableRooms.includes(state.selectedRoomDetail)) {
      state.selectedRoomDetail = availableRooms[0] || '';
    }

    let navHtml = `
      <div class="room-nav-strip">
        ${availableRooms.map(r => `
          <button class="room-strip-btn ${state.selectedRoomDetail === r ? 'active' : ''}" data-room="${escapeHtml(r)}">
            ${escapeHtml(r)}
          </button>
        `).join('')}
      </div>
    `;

    const roomTracks = tracks
      .filter(t => t.rooms.includes(state.selectedRoomDetail))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    let itemsHtml = `
      <div class="room-sequence-container">
        ${roomTracks.map(t => {
          const isFav = state.favorites.has(t.id);
          return `
            <div class="room-timeline-item" data-track-id="${t.id}">
              <div class="room-item-time">
                <span class="room-time-start">${t.start_time}</span>
                <span class="room-time-dur">${t.duration_min} minutes</span>
                <span class="time-badge">${t.start_time} – ${t.end_time}</span>
              </div>
              <div class="talk-card ${isFav ? 'is-favorite' : ''}" data-track-id="${t.id}">
                <div class="card-topbar">
                  <div class="card-meta-left">
                    <span class="room-badge">${t.room_str}</span>
                    ${t.youtube_id ? `<span class="video-indicator">🎥 Stream</span>` : ''}
                  </div>
                  <button class="card-fav-btn" data-fav-id="${t.id}" title="Toggle Bookmark">
                    ${isFav ? '★' : '☆'}
                  </button>
                </div>
                <h3 class="card-title">${highlightMatch(t.title, state.searchQuery)}</h3>
                ${t.speaker ? `
                  <div class="card-speaker-row">
                    ${t.speaker_avatar ? `<img class="speaker-avatar" src="${t.speaker_avatar}" alt="${escapeHtml(t.speaker)}" loading="lazy">` : `<div class="speaker-avatar-fallback">${getInitials(t.speaker)}</div>`}
                    <div class="speaker-meta">
                      <span class="speaker-name">${escapeHtml(t.speaker)}</span>
                      <span class="speaker-role">${escapeHtml(t.speaker_role)}</span>
                    </div>
                  </div>
                ` : ''}
                ${t.description ? `<p class="card-snippet">${escapeHtml(t.description.slice(0, 180))}...</p>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    dom.byRoomContainer.innerHTML = navHtml + itemsHtml;

    dom.byRoomContainer.querySelectorAll('.room-strip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedRoomDetail = btn.getAttribute('data-room');
        renderByRoomView(tracks);
      });
    });

    attachCardListeners(dom.byRoomContainer);
  }

  // --- 4. Favorites / My Schedule View ---
  function renderFavoritesView(tracks) {
    const favTracks = state.allTracks
      .filter(t => state.favorites.has(t.id))
      .sort((a, b) => {
        if (a.day !== b.day) return a.day.localeCompare(b.day);
        return a.start_time.localeCompare(b.start_time);
      });

    // Detect time conflicts
    const conflicts = findScheduleConflicts(favTracks);

    let html = `
      <div class="favorites-header-banner">
        <div class="banner-content">
          <h2>⭐ My Personal Schedule (${favTracks.length} sessions)</h2>
          <p>Your curated OXP itinerary. Add to your phone's calendar or download as .ICS.</p>
        </div>
        <div class="banner-actions">
          <button class="action-btn primary" id="favDownloadIcs">
            <span>📅 Download My Schedule (.ICS)</span>
          </button>
          <button class="action-btn" id="favClearAll">
            <span>Clear Schedule</span>
          </button>
        </div>
      </div>
    `;

    if (conflicts.length > 0) {
      html += `
        <div class="conflict-alert">
          <span>⚠️ Warning: You have <strong>${conflicts.length} overlapping session(s)</strong> in your schedule!</span>
        </div>
      `;
    }

    if (favTracks.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">⭐</div>
          <h3>Your schedule is currently empty</h3>
          <p>Click the star icon (☆) on any talk in the timeline or room view to bookmark it here!</p>
          <button class="action-btn primary" id="browseTalksBtn">Explore Agenda</button>
        </div>
      `;
      dom.favoritesContainer.innerHTML = html;

      document.getElementById('browseTalksBtn')?.addEventListener('click', () => {
        switchView('timeline');
      });
      return;
    }

    // Group by day
    const dayGroups = new Map();
    favTracks.forEach(t => {
      if (!dayGroups.has(t.day)) {
        dayGroups.set(t.day, { dayLabel: t.day_label, tracks: [] });
      }
      dayGroups.get(t.day).tracks.push(t);
    });

    dayGroups.forEach(grp => {
      html += `
        <div class="timeline-slot">
          <div class="slot-header">
            <span class="slot-time-pill">${grp.dayLabel}</span>
            <div class="slot-divider"></div>
            <span class="slot-count">${grp.tracks.length} saved</span>
          </div>
          <div class="tracks-grid">
            ${grp.tracks.map(t => renderTalkCardHtml(t)).join('')}
          </div>
        </div>
      `;
    });

    dom.favoritesContainer.innerHTML = html;
    attachCardListeners(dom.favoritesContainer);

    document.getElementById('favDownloadIcs')?.addEventListener('click', () => {
      exportIcsFile(favTracks, 'My_OXP_2026_Schedule.ics');
    });

    document.getElementById('favClearAll')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all bookmarked sessions?')) {
        state.favorites.clear();
        saveFavorites();
        renderCurrentView();
        showToast('Schedule cleared', 'info');
      }
    });
  }

  function findScheduleConflicts(tracks) {
    const conflicts = [];
    for (let i = 0; i < tracks.length; i++) {
      for (let j = i + 1; j < tracks.length; j++) {
        const t1 = tracks[i];
        const t2 = tracks[j];
        if (t1.day === t2.day) {
          // Check overlap: start1 < end2 and start2 < end1
          if (t1.start_time < t2.end_time && t2.start_time < t1.end_time) {
            conflicts.push([t1, t2]);
          }
        }
      }
    }
    return conflicts;
  }

  // --- Talk Card HTML Builder ---
  function renderTalkCardHtml(t) {
    const isFav = state.favorites.has(t.id);
    return `
      <div class="talk-card ${isFav ? 'is-favorite' : ''}" data-track-id="${t.id}">
        <div class="card-topbar">
          <div class="card-meta-left">
            <span class="time-badge">${t.start_time} – ${t.end_time} (${t.duration_min}m)</span>
            <span class="room-badge">${t.room_str}</span>
            ${t.youtube_id ? `<span class="video-indicator">🎥 Stream</span>` : ''}
          </div>
          <button class="card-fav-btn" data-fav-id="${t.id}" title="Toggle Bookmark" aria-label="Toggle Bookmark">
            ${isFav ? '★' : '☆'}
          </button>
        </div>

        <h3 class="card-title">${highlightMatch(t.title, state.searchQuery)}</h3>

        ${t.speaker ? `
          <div class="card-speaker-row">
            ${t.speaker_avatar ? `<img class="speaker-avatar" src="${t.speaker_avatar}" alt="${escapeHtml(t.speaker)}" loading="lazy">` : `<div class="speaker-avatar-fallback">${getInitials(t.speaker)}</div>`}
            <div class="speaker-meta">
              <span class="speaker-name">${highlightMatch(t.speaker, state.searchQuery)}</span>
              <span class="speaker-role">${escapeHtml(t.speaker_role)}</span>
            </div>
          </div>
        ` : ''}

        ${t.description ? `<p class="card-snippet">${escapeHtml(t.description.slice(0, 160))}...</p>` : ''}

        ${t.badges.length > 0 ? `
          <div class="card-tags">
            ${t.badges.slice(0, 4).map(b => `<span class="card-tag">${escapeHtml(b)}</span>`).join('')}
            ${t.badges.length > 4 ? `<span class="card-tag">+${t.badges.length - 4}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function attachCardListeners(container) {
    container.querySelectorAll('.talk-card').forEach(card => {
      card.addEventListener('click', e => {
        // If clicked on favorite button, don't open modal
        if (e.target.closest('.card-fav-btn')) {
          return;
        }
        const trackId = card.getAttribute('data-track-id');
        openDetailModal(trackId);
      });
    });

    container.querySelectorAll('.card-fav-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const trackId = btn.getAttribute('data-fav-id');
        toggleFavorite(trackId, e);
      });
    });
  }

  // --- Detail Modal ---
  function openDetailModal(trackId) {
    const track = state.allTracks.find(t => t.id === trackId);
    if (!track) return;

    state.activeModalTrack = track;

    // Badges
    dom.modalBadges.innerHTML = track.badges.map(b => `<span class="card-tag">${escapeHtml(b)}</span>`).join('');

    // Title
    dom.modalTitle.textContent = track.title;

    // Logistics
    dom.modalDateTime.textContent = `${track.day_label}, ${track.start_time} – ${track.end_time}`;
    dom.modalLocation.textContent = track.room_str;
    dom.modalDuration.textContent = `${track.duration_min} minutes`;

    // Video Player
    if (track.youtube_id) {
      dom.modalVideoContainer.style.display = 'block';
      dom.modalVideoIframe.src = `https://www.youtube-nocookie.com/embed/${track.youtube_id}?rel=0`;
    } else {
      dom.modalVideoContainer.style.display = 'none';
      dom.modalVideoIframe.src = '';
    }

    // Speaker Section
    if (track.speaker) {
      dom.modalSpeakerCard.style.display = 'flex';
      dom.modalSpeakerName.textContent = track.speaker;
      dom.modalSpeakerRole.textContent = track.speaker_role;
      dom.modalSpeakerBio.textContent = track.speaker_bio;
      if (track.speaker_avatar) {
        dom.modalSpeakerAvatar.src = track.speaker_avatar;
        dom.modalSpeakerAvatar.style.display = 'block';
      } else {
        dom.modalSpeakerAvatar.style.display = 'none';
      }
    } else {
      dom.modalSpeakerCard.style.display = 'none';
    }

    // Description
    dom.modalDescription.textContent = track.description || 'No description available for this session.';

    // Favorite button
    const isFav = state.favorites.has(track.id);
    dom.modalFavText.textContent = isFav ? 'In My Schedule' : 'Add to My Schedule';
    dom.modalFavBtn.classList.toggle('primary', !isFav);

    // Google Calendar button
    dom.modalGcalBtn.href = generateGoogleCalendarUrl(track);

    // Odoo original link
    if (track.url) {
      dom.modalOdooLinkBtn.href = track.url.startsWith('http') ? track.url : `https://www.odoo.com${track.url}`;
      dom.modalOdooLinkBtn.style.display = 'inline-flex';
    } else {
      dom.modalOdooLinkBtn.style.display = 'none';
    }

    // Show modal
    dom.modalBackdrop.classList.add('show');
    dom.body.style.overflow = 'hidden';

    // Deep link url update
    updateUrlParams(track.id);
  }

  function closeDetailModal() {
    dom.modalBackdrop.classList.remove('show');
    dom.body.style.overflow = '';
    dom.modalVideoIframe.src = '';
    state.activeModalTrack = null;
    updateUrlParams();
  }

  // --- Calendar Integration (Google & ICS) ---
  function parseDateTimeUtc(dateStr, timeStr) {
    // dateStr: "2026-09-24", timeStr: "08:30"
    // Event is in Europe/Brussels (CEST in September = UTC+2)
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    // Create Date in UTC treating local as UTC+2
    const d = new Date(Date.UTC(year, month - 1, day, hours - 2, minutes, 0));
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function generateGoogleCalendarUrl(track) {
    const startIso = parseDateTimeUtc(track.day, track.start_time);
    const endIso = parseDateTimeUtc(track.day, track.end_time);

    const title = encodeURIComponent(track.title);
    const details = encodeURIComponent(
      `${track.description || ''}\n\nSpeaker: ${track.speaker_raw}\nLocation: ${track.room_str}\nOfficial URL: https://www.odoo.com${track.url || ''}`
    );
    const location = encodeURIComponent(`${track.room_str}, Brussels Expo, Belgium`);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
  }

  function exportIcsFile(tracks, filename = 'OXP_2026_Schedule.ics') {
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OXP 2026 Schedule Explorer//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Odoo Experience 2026',
      'X-WR-TIMEZONE:Europe/Brussels',
    ];

    tracks.forEach(t => {
      const startIso = parseDateTimeUtc(t.day, t.start_time);
      const endIso = parseDateTimeUtc(t.day, t.end_time);
      const cleanDesc = (t.description || '').replace(/\n/g, '\\n').replace(/,/g, '\\,');

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${t.id}@odooexperience2026`);
      icsContent.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
      icsContent.push(`DTSTART:${startIso}`);
      icsContent.push(`DTEND:${endIso}`);
      icsContent.push(`SUMMARY:${escapeIcs(t.title)}`);
      icsContent.push(`DESCRIPTION:${cleanDesc}`);
      icsContent.push(`LOCATION:${escapeIcs(t.room_str + ', Brussels Expo, Belgium')}`);
      if (t.url) {
        icsContent.push(`URL:https://www.odoo.com${t.url}`);
      }
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    downloadBlob(blob, filename);
    showToast(`Downloaded ${filename} (${tracks.length} sessions)`, 'success');
  }

  function escapeIcs(str) {
    return (str || '').replace(/[\\,;]/g, '\\$&');
  }

  // --- CSV & JSON Exports ---
  function exportCsvFile(tracks, filename = 'OXP_2026_Sessions.csv') {
    const headers = ['ID', 'Day', 'Date', 'Start Time', 'End Time', 'Duration (min)', 'Title', 'Speaker', 'Speaker Role', 'Rooms', 'Tags', 'Video URL', 'Odoo URL'];
    const rows = tracks.map(t => [
      t.id,
      t.day_label,
      t.day,
      t.start_time,
      t.end_time,
      t.duration_min,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${(t.speaker || '').replace(/"/g, '""')}"`,
      `"${(t.speaker_role || '').replace(/"/g, '""')}"`,
      `"${(t.room_str || '').replace(/"/g, '""')}"`,
      `"${(t.badges.join(', ') || '').replace(/"/g, '""')}"`,
      t.youtube_id ? `https://youtube.com/watch?v=${t.youtube_id}` : '',
      t.url ? `https://www.odoo.com${t.url}` : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
    showToast(`Exported ${tracks.length} sessions to CSV`, 'success');
  }

  function exportJsonFile() {
    const blob = new Blob([JSON.stringify(state.allTracks, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'OXP_2026_All_Tracks.json');
    showToast('Downloaded complete JSON dataset', 'success');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- UI Event Handlers ---
  function setupEventListeners() {
    // Search input (debounced)
    let searchTimeout = null;
    dom.searchInput.addEventListener('input', e => {
      clearTimeout(searchTimeout);
      const val = e.target.value;
      dom.searchClearBtn.style.display = val ? 'block' : 'none';
      searchTimeout = setTimeout(() => {
        state.searchQuery = val;
        checkActiveFilters();
        renderCurrentView();
      }, 150);
    });

    dom.searchClearBtn.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClearBtn.style.display = 'none';
      state.searchQuery = '';
      checkActiveFilters();
      renderCurrentView();
      dom.searchInput.focus();
    });

    // View Switcher Buttons
    dom.viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        switchView(view);
      });
    });

    // My Schedule top button
    dom.myScheduleBtn.addEventListener('click', () => {
      switchView('favorites');
    });

    // Dropdown filters
    dom.roomSelect.addEventListener('change', e => {
      state.selectedRoom = e.target.value;
      checkActiveFilters();
      renderCurrentView();
    });

    dom.tagSelect.addEventListener('change', e => {
      state.selectedTag = e.target.value;
      checkActiveFilters();
      renderCurrentView();
    });

    dom.videoOnlyCheck.addEventListener('change', e => {
      state.videoOnly = e.target.checked;
      checkActiveFilters();
      renderCurrentView();
    });

    dom.resetFiltersBtn.addEventListener('click', resetAllFilters);
    dom.emptyResetBtn.addEventListener('click', resetAllFilters);

    // Theme toggle
    dom.themeToggleBtn.addEventListener('click', toggleTheme);

    // Export Dropdown
    dom.exportMenuBtn.addEventListener('click', e => {
      e.stopPropagation();
      dom.exportDropdown.classList.toggle('show');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.dropdown-wrapper')) {
        dom.exportDropdown.classList.remove('show');
      }
    });

    dom.exportIcsFavorites.addEventListener('click', () => {
      const favs = state.allTracks.filter(t => state.favorites.has(t.id));
      if (favs.length === 0) {
        showToast('Please star at least one talk first!', 'info');
        return;
      }
      exportIcsFile(favs, 'My_OXP_2026_Schedule.ics');
      dom.exportDropdown.classList.remove('show');
    });

    dom.exportIcsAll.addEventListener('click', () => {
      exportIcsFile(state.allTracks, 'OXP_2026_Full_Conference.ics');
      dom.exportDropdown.classList.remove('show');
    });

    dom.exportCsvBtn.addEventListener('click', () => {
      exportCsvFile(getFilteredTracks(), 'OXP_2026_Filtered_Schedule.csv');
      dom.exportDropdown.classList.remove('show');
    });

    dom.exportJsonBtn.addEventListener('click', () => {
      exportJsonFile();
      dom.exportDropdown.classList.remove('show');
    });

    // Modal Events
    dom.modalCloseBtn.addEventListener('click', closeDetailModal);
    dom.modalBackdrop.addEventListener('click', e => {
      if (e.target === dom.modalBackdrop) {
        closeDetailModal();
      }
    });

    dom.modalFavBtn.addEventListener('click', () => {
      if (state.activeModalTrack) {
        toggleFavorite(state.activeModalTrack.id);
      }
    });

    dom.modalIcsBtn.addEventListener('click', () => {
      if (state.activeModalTrack) {
        exportIcsFile([state.activeModalTrack], `${state.activeModalTrack.title.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}.ics`);
      }
    });

    dom.modalShareBtn.addEventListener('click', () => {
      if (state.activeModalTrack) {
        const shareUrl = `${window.location.origin}${window.location.pathname}?track=${state.activeModalTrack.id}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast('Link copied to clipboard!', 'success');
        });
      }
    });

    // Scroll to Top
    window.addEventListener('scroll', () => {
      dom.scrollTopBtn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });
    dom.scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', e => {
      // Escape
      if (e.key === 'Escape') {
        if (dom.modalBackdrop.classList.contains('show')) {
          closeDetailModal();
        } else if (state.searchQuery) {
          dom.searchInput.value = '';
          state.searchQuery = '';
          dom.searchClearBtn.style.display = 'none';
          checkActiveFilters();
          renderCurrentView();
        }
      }

      // Forward slash / to search (when not in input)
      if (e.key === '/' && document.activeElement !== dom.searchInput) {
        e.preventDefault();
        dom.searchInput.focus();
        dom.searchInput.select();
      }

      // Numbers 1-5 to switch days
      if (document.activeElement !== dom.searchInput && !dom.modalBackdrop.classList.contains('show')) {
        if (e.key >= '1' && e.key <= '5') {
          const dayIndex = parseInt(e.key, 10) - 1;
          if (state.days[dayIndex]) {
            state.activeDay = state.days[dayIndex].date;
            dom.daysBar.querySelectorAll('.day-tab-btn').forEach(btn => {
              btn.classList.toggle('active', btn.getAttribute('data-day') === state.activeDay);
            });
            renderCurrentView();
          }
        } else if (e.key === '0') {
          state.activeDay = 'all';
          dom.daysBar.querySelectorAll('.day-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-day') === 'all');
          });
          renderCurrentView();
        } else if (e.key.toLowerCase() === 't') {
          switchView('timeline');
        } else if (e.key.toLowerCase() === 'g') {
          switchView('grid');
        } else if (e.key.toLowerCase() === 'r') {
          switchView('by_room');
        } else if (e.key.toLowerCase() === 'm') {
          switchView('favorites');
        }
      }
    });
  }

  function switchView(viewName) {
    state.activeView = viewName;
    dom.viewButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });
    updateUrlParams();
    renderCurrentView();
  }

  // --- URL Query Params Sync ---
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('day')) {
      const d = params.get('day');
      if (d === 'all' || state.days.some(x => x.date === d)) {
        state.activeDay = d;
      }
    }
    if (params.has('view')) {
      const v = params.get('view');
      if (['timeline', 'grid', 'by_room', 'favorites'].includes(v)) {
        state.activeView = v;
        dom.viewButtons.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-view') === v);
        });
      }
    }
    if (params.has('q')) {
      state.searchQuery = params.get('q');
      dom.searchInput.value = state.searchQuery;
      dom.searchClearBtn.style.display = 'block';
    }
    if (params.has('track')) {
      const trackId = params.get('track');
      setTimeout(() => {
        openDetailModal(trackId);
      }, 100);
    }
  }

  function updateUrlParams(trackId) {
    const params = new URLSearchParams();
    if (state.activeDay !== '2026-09-24') {
      params.set('day', state.activeDay);
    }
    if (state.activeView !== 'timeline') {
      params.set('view', state.activeView);
    }
    if (state.searchQuery) {
      params.set('q', state.searchQuery);
    }
    if (trackId) {
      params.set('track', trackId);
    }
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }

  // --- Helpers ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightMatch(text, query) {
    if (!text) return '';
    if (!query || !query.trim()) return escapeHtml(text);
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query.trim());
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark style="background: rgba(251, 191, 36, 0.35); color: inherit; padding: 1px 3px; border-radius: 3px;">$1</mark>');
  }

  function getInitials(name) {
    if (!name) return 'O';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (type === 'success') {
      toast.style.borderLeftColor = 'var(--odoo-teal)';
    } else if (type === 'error') {
      toast.style.borderLeftColor = 'var(--odoo-rose)';
    }
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Boot Application
  document.addEventListener('DOMContentLoaded', init);
})();
