"""Browser smoke tests: uv run --group e2e pytest -m e2e

Needs Playwright's Chromium (`uv run --group e2e playwright install chromium`).
Gemini is faked (see conftest), so this runs offline and costs nothing.
"""

import pytest

playwright = pytest.importorskip('playwright.sync_api')

pytestmark = pytest.mark.e2e
NOW = '?now=2026-09-24T14:10'


@pytest.fixture(scope='module')
def browser():
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch()
        yield browser
        browser.close()


@pytest.fixture
def page(browser, server):
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(server + '/' + NOW + '#view=grid')
    page.wait_for_selector('.tt-col .ev')
    yield page
    context.close()
    assert not errors, errors


def test_list_is_the_default_view(browser, server):
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.goto(server + '/' + NOW)
    page.wait_for_selector('.slot')
    assert 'view=list' in page.url
    context.close()


def test_timetable(page):
    assert page.locator('.day[aria-selected="true"]').inner_text().strip() == 'Thu 24'
    assert page.locator('.tt-room').count() >= 10
    assert page.locator('.now-line').count() == 1


def test_hover_card_and_drawer(page):
    card = page.locator('.tt-col .ev').nth(5)
    title = card.locator('.ev-title').inner_text()
    card.hover()
    page.wait_for_selector('#popover:not([hidden])')
    card.click()
    page.wait_for_selector('#drawer.open')
    assert page.locator('.dr-title').inner_text() == title


def test_header_is_one_row(page):
    assert page.locator('.topbar').bounding_box()['height'] <= 60


def test_room_filter_and_url_state(page):
    page.click('[data-menu=filters]')
    page.click('[data-chip="rooms|Hall 6.A"]')
    page.keyboard.press('Escape')
    assert page.locator('.tt-room').count() == 1
    assert 'rooms=Hall+6.A' in page.url
    assert page.locator('.achip').count() == 1  # removable chip shows the active filter
    page.locator('.achip').click()
    assert page.locator('.tt-room').count() > 1


def test_language_flags_toggle(page):
    everything = page.locator('.tt-col .ev').count()
    page.click('.flag-btn[aria-label=French]')
    assert 'langs=fr' in page.url
    french = page.locator('.tt-col .ev').count()
    assert 0 < french < everything
    page.click('.flag-btn[aria-label=English]')  # flags combine
    assert 'langs=fr|en' in page.url or 'langs=en|fr' in page.url
    page.click('.flag-btn[aria-label=French]')
    page.click('.flag-btn[aria-label=English]')
    assert page.locator('.tt-col .ev').count() == everything


def test_filters_panel_is_minimal(page):
    page.click('[data-menu=filters]')
    headings = page.locator('.fp-sec > h4').all_inner_texts()
    assert headings == ['Speaker', 'Topic', 'Level', 'Room', 'Show']


def test_speaker_filter_shows_external_talks(page):
    page.click('[data-menu=filters]')
    page.click('[data-chip="speakers|external"]')
    page.keyboard.press('Escape')
    assert page.locator('.tt-col .ev').count() > 10
    assert page.locator('.tt-col .ev .aff-odoo').count() == 0


def test_search_is_a_ranked_page_not_a_filter(page):
    page.fill('#q', 'payrol')  # typo, and payroll talks are spread over several days
    page.wait_for_selector('.results')
    titles = page.locator('.results .row-title').all_inner_texts()
    assert titles and all('payroll' in t.lower() for t in titles[:3])
    days = {d.strip() for d in page.locator('.results .tc-day').all_inner_texts()}
    assert len(days) > 1  # across days, whatever day tab is selected
    page.click('[data-search-day="2026-09-26"]')
    assert {d.strip() for d in page.locator('.results .tc-day').all_inner_texts()} == {'SAT 26'}
    page.click('[data-day="2026-09-25"]')  # picking a day leaves search
    assert page.locator('.results').count() == 0 and page.input_value('#q') == ''


def test_star_and_saved_view(page):
    page.locator('.tt-col .ev').first.hover()
    page.locator('.tt-col .ev .star').first.click()
    page.keyboard.press('s')
    assert page.locator('.mine-head h1').inner_text() == 'My schedule'
    assert page.locator('.row').count() == 1


def test_chat_renders_cited_sessions(page):
    page.keyboard.press('a')
    page.fill('#chat-input', 'Any AI talks?')
    page.keyboard.press('Enter')
    page.wait_for_selector('#chat-log .msg-actions')
    assert page.locator('#chat-log .ref[data-id]').count() == 2
    page.locator('#chat-log .ref[data-id]').first.click()
    page.wait_for_selector('#drawer.open')


def test_phone_defaults_to_list(browser, server):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto(server + '/' + NOW)
    page.wait_for_selector('.slot')
    assert 'view=list' in page.url
    context.close()


@pytest.fixture
def phone(browser, server):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto(server + '/' + NOW + '#day=2026-09-24&view=grid')
    page.wait_for_selector('.tth')
    yield page
    context.close()


def test_phone_timetable_is_rotated_and_opens_at_now(phone):
    assert phone.locator('.tt-gutter').count() == 0  # no left time column
    assert phone.locator('.tth-row').count() >= 10
    assert phone.evaluate("document.querySelector('#main').scrollLeft") > 0  # scrolled to 14:10
    assert phone.locator('.topbar').bounding_box()['height'] <= 56  # one row


def test_phone_search_opens_from_icon_and_lists_results(phone):
    phone.tap('#search-btn')
    phone.keyboard.type('payroll')
    phone.wait_for_selector('.results')
    phone.tap('#search-close')
    assert phone.locator('.results').count() == 0


def test_filter_change_animates_tiles(page):
    page.click('[data-menu=filters]')
    page.click('[data-chip="tracks|ai"]')
    assert page.evaluate('document.getAnimations().length') > 0


def test_opening_lands_on_now_even_with_a_stale_url(browser, server):
    """17:50: a long session that started at 14:00 is still live; the list must show the 17:30 talks."""
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.goto(server + '/?now=2026-09-24T17:50#day=2026-09-26&view=list&q=payroll')
    page.wait_for_selector('.slot')
    assert page.locator('.day[aria-selected="true"]').inner_text().strip() == 'Thu 24'
    assert page.locator('.results').count() == 0
    first_visible = page.evaluate(
        """(() => {
          const top = document.querySelector('#main').getBoundingClientRect().top;
          const slots = [...document.querySelectorAll('.slot')];
          return slots.find(s => s.getBoundingClientRect().top >= top - 8).dataset.slot;
        })()"""
    )
    assert first_visible == str(17 * 60 + 30)
    context.close()


def test_phone_grid_skips_empty_morning_and_evening(phone):
    phone.evaluate("document.querySelector('#main').scrollTo(0, 0)")
    first_hour = phone.locator('.tth-hour').first.inner_text()
    assert first_hour == '11:30'  # Thursday's first talks, not the 07:30 welcome
    chips = phone.locator('.plen-chip').all_inner_texts()
    assert any('Keynote' in c for c in chips) and any('Concert' in c for c in chips)
