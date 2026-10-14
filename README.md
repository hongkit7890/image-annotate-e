# ImageAnnotatE

Annotate images inside Obsidian with an Evernote-style floating toolbar: pen, text, highlight, shapes, arrows, badges, blur, crop, rotate, and select/move/copy.

**Desktop only.** Works offline. No network access, accounts, or telemetry.

## Features

- Right-click an embedded image (or image file) → **Annotate**
- Tools: Select, Pen, Text, Highlight, Shapes, Arrow, Badge, Blur, Crop, Rotate
- White outline / border option for drawings and text
- Color picker plus hex / RGB code entry
- Undo (`Ctrl+Z`), Clear, Save
- Note embeds refresh automatically after save

## Install (manual)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest).
2. Create a folder under your vault: `.obsidian/plugins/image-annotate-e/`
3. Copy the three files into that folder.
4. Enable **ImageAnnotatE** in Obsidian Settings → Community plugins.

Once published in the [Obsidian Community directory](https://community.obsidian.md), you can install it from Settings → Community plugins → Browse.

## Usage

1. Open a note that contains an image, or select an image in the file explorer.
2. Right-click the image → **Annotate**.
3. Draw with the toolbar (Arrow is the default tool).
4. Click **Save** (or press `Enter`) to write the annotated image back to the vault.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `V` | Select |
| `P` | Pen |
| `T` | Text |
| `S` | Shapes |
| `A` | Arrow |
| `B` | Badge |
| `U` | Blur |
| `R` | Rotate |
| `C` | Open color picker |
| `Enter` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste selected drawing |
| `Ctrl+D` | Duplicate selected drawing |
| `Delete` / `Backspace` | Delete selected drawing |
| Arrow keys | Nudge selection (`Shift` = 10px) |

While typing text, letter shortcuts are ignored so you can type normally.

### Select tool

- Click a drawing to select it.
- Drag to move.
- `Alt`+drag, or `Ctrl+D`, to copy.
- `Ctrl+C` / `Ctrl+V` to copy and paste.

## Development

```bash
npm install
npm run build
npm run test:harness
```

## Support

If this plugin helps you, you can [buy me a coffee](https://buymeacoffee.com/hsckit) ($5).

## License

MIT — see [LICENSE](LICENSE).
