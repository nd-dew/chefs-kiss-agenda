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
    page.goto(server + '/' + NOW)
    page.wait_for_selector('.tt-col .ev')
    yield page
    context.close()
    assert not errors, errors


def test_timetable_is_the_default_view(page):
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


def test_language_selector(page):
    page.click('[data-menu=langs]')
    page.click('[data-lang=fr]')
    assert 'langs=fr' in page.url
    assert page.locator('[data-menu=langs]').inner_text().strip().startswith('French')


def test_search_widens_to_other_days(page):
    page.fill('#q', 'Eden Hazard')  # only on Saturday
    page.wait_for_selector('.results')
    assert 'Saturday' in page.locator('.res-h h2').first.inner_text()


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
