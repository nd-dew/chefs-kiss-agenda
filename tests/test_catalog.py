from oxp_agenda import catalog


def test_every_session_gets_a_ref_matching_its_position(agenda):
    lines = catalog.build_catalog(agenda).splitlines()
    assert len(lines) == len(agenda['tracks'])
    assert all(line.startswith(f's{i} | ') for i, line in enumerate(lines))


def test_catalog_line_fields():
    track = {
        'short_label': 'Thu Sep 24',
        'start_time': '14:00',
        'end_time': '14:30',
        'rooms': ['Hall 6.A'],
        'room_str': 'Hall 6.A',
        'title': 'What is new',
        'speaker_raw': 'Ann, CEO',
        'badges': ['AI', 'English'],
        'youtube_id': 'abc',
        'description': '<p>Hello</p>\n  world',
    }
    assert catalog.catalog_line(7, track) == (
        's7 | Thu Sep 24 14:00-14:30 | Hall 6.A | What is new | Ann, CEO | tags: AI, English | video | Hello world'
    )


def test_plenary_sessions_are_labelled_all_venues():
    track = {
        'short_label': 'Thu Sep 24',
        'start_time': '12:30',
        'end_time': '13:30',
        'rooms': ['A', 'B', 'C'],
        'room_str': 'A, B, C',
        'title': 'Lunch',
        'badges': [],
        'description': '',
    }
    assert ' | All venues (plenary) | ' in catalog.catalog_line(0, track)


def test_short_description_truncates_on_a_word_boundary():
    text = catalog.short_description('word ' * 200, limit=30)
    assert len(text) <= 31
    assert text.endswith('word…')


def test_system_prompt_mentions_citation_format_and_days(agenda):
    prompt = catalog.build_system_prompt(agenda)
    assert '[[s123]]' in prompt
    assert 'Thursday, Sep 24' in prompt
    assert 'Tuesday, Sep 22 (masterclasses only)' in prompt
