# Browser History & Analytics Tracker

A Chrome extension that visualizes your browsing history: per-domain stats, interactive charts, filters, and CSV export—available both in a compact **popup** and a full **dashboard** tab.

## Features

- **Root-domain grouping** — Merges visits by site; favicons in the list
- **Visit & page counts** — Frequency and distinct pages per site; last and earliest visit
- **Share bar** — Share of total visits under the current filter
- **Time filters** — All, hour, today, week, month; calendar single-day pick
- **Sorting** — By most recent visit or by visit count
- **Search** — Titles, URLs, domains; optional regex mode
- **Charts** — Visit trends, hourly distribution, category pie chart (stats view)
- **Chart PNG export** — On the **dashboard** Statistics workspace, each chart (trend, hour distribution, category) has a **download** control that saves the current chart as a **PNG** image via the `downloads` API (default download folder)
- **CSV export** — UTF-8 (with BOM) for the current filtered list
- **Privacy** — Domain blacklist; delete all history for a site (no extra browser confirm in the popup)
- **Themes** — Light / dark mode
- **Full-page dashboard** — Open via extension options or the “extension page” control: sidebar navigation, statistics workspace, blacklist management, and about/permissions copy
- **Internationalization** — UI strings for **English**, **Simplified Chinese**, **Japanese**, **Russian**, **Indonesian**, **Arabic** (RTL), **Spanish**, **Portuguese (Brazil)**, **German**, **French**, and **Korean**; language follows saved preference and browser locale fallback

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the project folder

## Usage

- Click the toolbar icon to open the **popup** (history list and stats view toggle)
- Use filters, search, export, calendar, and privacy settings from the popup footer
- Open the **dashboard** (full tab): **⋮ → Extensions → [this extension] → Options**, or use the extension-page button where available
- In the dashboard sidebar, switch **Statistics**, **Blacklist**, and **About**; pick **Language** and **Theme** in the footer
- On the dashboard **Statistics** page, use the small **download** button next to a chart title to save that chart as a PNG file
- Deleting a site’s history removes all matching URLs for that root domain immediately (irreversible)

## Tech stack

- Vanilla JavaScript
- Chrome Extensions API (`history`, `storage`, `favicon`, `downloads`)
- CSS (popup and dashboard stylesheets)

## License

MIT
