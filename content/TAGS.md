# Tags and page layout

How posts and guides on https://wiki.closetrepublic.com are organised. Wiki.js lists every page with a tag at `/t/<tag>` and lets readers combine tags in the tag browser (`/t`), so tags do most of the organising and paths stay short.

## Rules

1. Tags are lowercase, words joined with hyphens, no spaces. Wiki.js lowercases tags anyway.
2. Each page has **exactly one** `type-` tag, **at least one** `region-` tag and **one to four** `topic-` tags.
3. Prefixes keep the tag list readable: `type-`, `region-`, `topic-`, `audience-`, `source-`, and the status tags.
4. Add a new tag only if at least three pages will use it. Add it to this file in the same change.

## Type (one per page)

| Tag | Use for |
| --- | --- |
| `type-guide` | Step-by-step how-to (change a name, get a transgender certificate, find an affirming doctor) |
| `type-explainer` | Explains a topic or concept in plain language |
| `type-glossary` | One term: meaning, origin, usage |
| `type-law` | A law, rule or court judgment and what it means |
| `type-history` | Events, movements, people of the past (no living private people) |
| `type-resource-list` | Curated list of organisations, helplines, reading |
| `type-post` | Dated article or announcement (mirrors or extends a Gazette post) |
| `type-republic` | Closet Republic's own institutions: constitution, parliament, passport, funds |

## Region (one or more)

| Tag | Use for |
| --- | --- |
| `region-global` | Applies everywhere or compares countries |
| `region-india` | India-wide |
| `region-in-<state>` | One Indian state or union territory, for example `region-in-maharashtra`, `region-in-tamil-nadu`, `region-in-delhi`, `region-in-karnataka`, `region-in-west-bengal`, `region-in-kerala` |
| `region-<country>` | Another country, for example `region-uk`, `region-usa` |

## Topic (one to four)

| Tag | Covers |
| --- | --- |
| `topic-identity` | Orientation and gender identities, labels |
| `topic-coming-out` | Coming out, staying safe while closeted, family conversations |
| `topic-legal-rights` | Rights, discrimination, police, courts |
| `topic-documents` | Names, gender markers, ID cards, certificates, passports |
| `topic-relationships` | Partnerships, marriage, cohabitation, family |
| `topic-health` | Physical and sexual health, HIV, gender-affirming care |
| `topic-mental-health` | Counselling, affirming therapists, conversion "therapy" harms |
| `topic-safety` | Online safety, harassment, emergencies (links to the Emergency Broadcast System) |
| `topic-work` | Workplace, education, housing |
| `topic-faith` | Religion and spirituality |
| `topic-culture` | Language, art, media, events, pride |
| `topic-community` | Organisations, groups, meeting safely |
| `topic-history` | Movement history, archives |

## Audience (optional)

`audience-allies`, `audience-families`, `audience-youth` (16 and over, per the Terms), `audience-professionals` (doctors, lawyers, employers, teachers).

## Source and status (set by the importer and reviewers)

| Tag | Meaning | Who sets it |
| --- | --- | --- |
| `source-<id>` | Where imported text came from, for example `source-wikipedia-en`, `source-lgbta-miraheze` | Importer |
| `imported-draft` | Created by the importer, not yet reviewed | Importer; reviewer removes |
| `needs-review` | Waiting for fact-check | Importer or author; reviewer removes |
| `fact-checked` | Passed the checklist in [IMPORT-POLICY.md](IMPORT-POLICY.md) | Reviewer |
| `source-changed` | Source page changed after review | Importer (on the draft copy only) |
| `needs-update` | Known to be out of date | Anyone |

## Paths

Paths group pages for the sidebar and for page rules. Keep them shallow.

| Path | Holds | Typical tags |
| --- | --- | --- |
| `/home` | Wiki start page | |
| `/guides/<slug>` | All how-to guides | `type-guide` |
| `/glossary/<term>` | One page per term | `type-glossary`, `topic-identity` |
| `/law/india/<slug>` | Indian Acts, rules, judgments | `type-law`, `region-india` |
| `/law/global/<slug>` | Other countries, comparisons | `type-law`, `region-global` |
| `/health/<slug>` | Health and mental health | `topic-health` or `topic-mental-health` |
| `/history/<slug>` | History and archives | `type-history` |
| `/resources/<slug>` | Resource lists, helplines | `type-resource-list` |
| `/posts/<yyyy>/<slug>` | Dated posts | `type-post` |
| `/republic/<slug>` | Closet Republic itself | `type-republic` |
| `/drafts/...` | Unreviewed pages (hidden) | `needs-review` |

## Navigation

In Administration > Navigation, use **Custom Navigation** with these top links, each pointing at a tag page or a section start page:

1. Start here: `/home`
2. Guides: `/t/type-guide`
3. Glossary: `/t/type-glossary`
4. Law in India: `/t/type-law/region-india`
5. Health: `/t/topic-health`
6. Get help: `/resources/get-help-india`
7. The Republic: `/t/type-republic`
8. Browse by tag: `/t`

Wiki.js tag pages accept several tags separated by `/` and show only pages that have all of them.
