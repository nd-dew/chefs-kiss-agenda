import json

import pytest

from oxp_agenda import affiliation


def talk(raw, badges=(), i=0):
    return {'id': f't{i}', 'speaker_raw': raw, 'badges': list(badges), 'rooms': ['Hall 6.A'], 'is_masterclass': False}


@pytest.mark.parametrize(
    ('raw', 'badges', 'kind', 'orgs'),
    [
        ('Lucie Allard from Odoo', [], 'odoo', ['Odoo']),
        ('Louise Cobut, Business Analyst at Odoo', [], 'odoo', ['Odoo']),
        ('Andrzej Pietrusiak (pian), Software developer at Odoo', [], 'odoo', ['Odoo']),
        ('Roch de Vidts (rodv)', ['Internal'], 'odoo', ['Odoo']),  # "de" is part of a name, not a company
        ('Sebastien Didelot, CEO at akolio', ['Community'], 'external', ['akolio']),
        ('Dimitrios Dimitriou, Senior Business Development Manager @Kurzgesagt', [], 'external', ['Kurzgesagt']),
        ('Benoît Deper from Aerospacelab & Fabien Pinckaers from Odoo', [], 'mixed', ['Odoo', 'Aerospacelab']),
        ('Cristina Cervera & Miguel Sanchez, BA (CRCE) at Cristina Cervera (crce)', [], 'odoo', ['Odoo']),
        ('Eden Hazard, Former Professional Footballer', ['Invited Speaker'], 'external', []),
    ],
)
def test_from_agenda(raw, badges, kind, orgs):
    result = affiliation.from_agenda(talk(raw, badges))
    assert (result['kind'], result['orgs']) == (kind, orgs)


def test_no_evidence_returns_none():
    assert affiliation.from_agenda(talk('Johan Wouters')) is None
    assert affiliation.from_agenda(talk('')) is None


def test_build_looks_up_only_unclear_speakers_and_reuses_results(tmp_path, monkeypatch):
    agenda = {
        'tracks': [
            talk('Lucie Allard from Odoo', i=0),
            talk('Lorenz Bogaert', ['Invited Speaker'], i=1),  # tag only -> checked online
            talk('Johan Wouters', ['Invited Speaker'], i=2),
            {**talk('Lunch', i=3), 'rooms': ['A', 'B', 'C']},  # plenary: skipped
        ]
    }
    asked = []

    def lookup(settings, people):
        asked.append(people)
        return [{'i': i, 'odoo': False, 'employer': 'Somewhere'} for i in range(len(people))]

    monkeypatch.setattr(affiliation, 'lookup_online', lookup)
    out = tmp_path / 'aff.json'
    settings = affiliation.GeminiSettings(api_key='k')
    result = affiliation.build(agenda, out, settings)
    assert asked == [['Johan Wouters', 'Lorenz Bogaert']]
    assert result['t0'] == {'kind': 'odoo', 'orgs': ['Odoo'], 'source': 'agenda'}
    assert result['t1'] == {'kind': 'external', 'orgs': ['Somewhere'], 'source': 'web'}
    assert 't3' not in result
    assert json.loads(out.read_text()) == result

    affiliation.build(agenda, out, settings)  # second run: nothing new to look up
    assert len(asked) == 1
