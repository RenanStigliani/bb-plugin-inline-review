# Inline Review (Local)

Review selected text in BB agent replies and add custom actions to the selection menu. This is Renan Stigliani's fork of [Inline Review by rdanhau](https://github.com/rdanhau/bb-plugin-inline-review), released under the [MIT License](LICENSE).

## Install

```sh
bb plugin install git:https://github.com/RenanStigliani/bb-plugin-inline-review.git --yes
```

The plugin ID is `inline-review-local`. If the original Inline Review is installed, disable it to avoid duplicate Feedback actions:

```sh
bb plugin disable inline-review
```

The two plugins have separate drafts and settings. Disabling the original preserves its data.

## Review a reply

Select text in an assistant reply and choose **Feedback**. A compact editor opens near the passage, above BB's side panel.

- **Add** saves the comment in the thread's feedback draft. Enter also saves; Shift+Enter adds a line.
- The airplane button saves the comment and sends the full feedback draft immediately.
- **Cancel** closes the editor without saving its contents.

Click the Feedback banner's header to expand or collapse the draft. You can edit or delete comments, add overall feedback, or choose **Clear (N)** to discard the draft after confirmation. **Send** submits one message containing each quoted passage and its comment. Ctrl+Enter or Command+Enter also sends from the overall-feedback field.

## Configure selection actions

Open **Settings → Installed plugins → Inline Review (Local) → Selection actions**.

Drag the grips to reorder actions, or use the up and down buttons. Each action can appear on the main menu, under **More (⋯)**, or stay hidden. The native **Add to chat** and plugin **Feedback** actions are included.

Choose **Add action** to create a custom label and instruction. Custom actions can open the feedback editor with the instruction filled in, or send it directly with the selected quote. Direct actions leave other saved feedback untouched. Choose **Save actions** to apply changes.

Three examples are included under More: **Agree**, **Do in a new bb thread**, and **Dispatch to parallel workers**. These send instructions to the current agent; that agent carries out any request to create threads or workers.

## Storage and compatibility

Drafts and action settings live on your BB server. Drafts survive reloads and are stored per thread. Sending feedback uses that thread's configured agent provider. Unsaved text in the editor is temporary.

The original BB 0.43.1 and SDK 0.4.87 minimum versions remain in the manifest. This fork was tested against the running BB instance during development; older versions have not been checked. Selection-menu customization and highlight restoration depend on BB's rendered HTML, so BB updates may require changes. Highlights are restored only when a saved quote has one visible matching passage.

## Development

Use a current Node.js version supported by the dependencies. Then run:

```sh
npm ci
npm test
npm run typecheck
bb plugin build
bb plugin install . --yes
```

For an installed local copy, rebuild and run `bb plugin reload inline-review-local`, or use `bb plugin dev` to rebuild and reload after edits.

The automated checks cover action settings, menu order and visibility, overflow actions, editor placement, drafts, and sending feedback. They do not replace checking the UI in BB.

See the [changelog](CHANGELOG.md) for version history and the [security notes](SECURITY.md) for data handling. Files under `docs/`, the screenshots, and `VERIFICATION.md` include material from the original project and may show its earlier interface.
