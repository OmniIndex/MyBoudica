# Sovereign MyBoudica

A separate, branded MyBoudica (Nextcloud) for one organisation or country
site, next to boudica_slm's multiuser stack. First site: **MyBoudica
Bangladesh** ("Beautiful Bangladesh"), the signed-in workspace for
boudica_slm's `content/sovereign_ai/bangladesh` (Ask Bangladesh).

| | `../collabora` (full) | `../community` (Eyemouth) | `sovereign` (this) |
|---|---|---|---|
| Who | the main MyBoudica | residents, incl. under-18s | staff of one organisation |
| Talk | yes, own signaling + TURN | **no** | yes, TURN of the full stack, no signaling server (small calls) |
| Sharing between users | yes | **no** | yes |
| Calendar, Mail | yes | no | yes (Mail: users connect their own accounts) |
| Boudica apps | ai, agent, code, dashboard | ai, code | ai, code, dashboard |
| AI calls go to | Boudica API | community service's guarded route | Boudica API |
| Who may sign in | everyone Boudica allows | the community's domain | the site's domain (`SITE_ACCOUNT_DOMAIN`), verified email only |

## Install

```bash
./setup.sh sites/bangladesh
```

`sites/<name>/site.env` holds the site's name, slogan, colour, account
domain and links; `sites/<name>/theme/` its logo, header logo, login
background and favicon. Answers can be given as environment variables with
`BOUDICA_UNATTENDED=1` (see the `ask` lines in `setup.sh`).

One sovereign instance per box: its services are named `sov-*` on the shared
`boudica_shared` network. Secrets go to `.env` (not committed).

### Behind ts-1's Apache (external proxy)

Answer "y" to the reverse-proxy question, then point the site's Apache vhost
at the loopback ports `setup.sh` prints (`/` -> Nextcloud 8102, Collabora
paths -> 8103, `/api/boudica/` and `/boudica-static/` -> boudica_slm's web).
Needs a DNS A record and a certificate (certbot) for the address first.

## Knowledge

Users of the site's domain are routed to the site's knowledge base by the
domain rule in boudica_slm's config (`bangladesh.myboudica.com` ->
`bangladesh.myboudica.com/`): the corpus folder of that name plus web pages
tagged for the site in `web_sources.txt` (`URL|category|bangladesh.myboudica.com`).
Other sites on the same Boudica never see those pages.

## Known limits

- The sign-in page is the shared Keycloak page ("Boudica Torc"), not the
  site's theme; the theme shows after sign-in.
- Talk without a signaling server: fine for chat and small calls only.
- Mail lets each user connect any mail server: users of a sovereign site are
  trusted staff, but it is a way to reach other hosts from the server.
- Pictures: the Bangladesh login background is CC BY-SA (Wikimedia Commons);
  the credit is on the Ask Bangladesh about page, linked as the legal notice.
