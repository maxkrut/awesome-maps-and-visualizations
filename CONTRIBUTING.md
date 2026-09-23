# Contributing

Share something worth exploring: maps, charts, simulations, historical images, visual essays, open datasets and creative visualization tools are welcome.

## Add an entry

Edit `data/links.json` and use an existing category:

```json
{
  "id": "example-project",
  "category": "society-culture-and-data-stories",
  "title": "Example Project",
  "description": "One short sentence explaining what you can explore.",
  "type": "Visualization",
  "language": "EN",
  "url": "https://example.org/"
}
```

- Use a unique, stable, lowercase ID with hyphens.
- Write the title and description in English; preserve recognizable project names.
- Describe what the project actually does, without promotional claims.
- Use one format: Map, Visualization, Timeline, Simulation, Virtual Tour, Collection, Article, Dataset or Tool. Image and Video are retained for standalone media. A globe is a Map; a visual essay is a Visualization. The allowed labels are listed in `data/project.json`.
- Set the source language to EN, RU or Multilingual. Use a specific language code for other original material when needed; LA (Latin) is currently supported. Historical is not a language.
- Use the category as the topic. Do not add another layer of per-entry topic tags.
- Prefer a stable project address. Keep coordinates or a specific page when that saved view is intentional.
- Check for duplicates. Do not remove an existing entry without an explicit editorial decision.

## Refresh the gallery

Run `npm run capture -- --only example-project`, inspect the screenshot, then run `npm run check-links`. See [MAINTAINING.md](MAINTAINING.md) for prerequisites.

Unavailable previews are represented explicitly. Do not substitute fabricated images or an access-denied screen. Let the checker update availability and the last successful date.

## Add a category

Add its ID, English title, short description and preferred cover-entry ID to `data/categories.json`. Use a new category only when several entries need it.

## Licensing contributions

By submitting a contribution, you agree to license your original catalogue content and documentation under CC BY 4.0, and your original code and SVG assets under MIT, as scoped in [LICENSE.md](LICENSE.md). Only contribute material you have the right to submit under those terms.

Third-party screenshots and other external material are excluded from these grants. Preserve their source information and identify the applicable license, permission, or other legal basis for including them. Do not treat a source link or a screenshot capture as permission. See [Third-party notices](THIRD_PARTY_NOTICES.md).
