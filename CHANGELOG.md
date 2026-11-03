# Changelog

All notable changes to Inline Review are documented here.

## [Unreleased]

## [1.1.0] - 2026-11-02

- Add custom selection actions with editable instructions, drag-and-drop ordering, and main-menu or overflow placement.
- Let custom actions open the feedback editor or send instructions directly to the current agent.
- Position the compact feedback editor near the selected passage and above the side panel.
- Add separate Add and Send Now controls to the editor.
- Simplify the review banner with a clickable header, one Send button, and a comment count on Clear.
- Keep the plugin ID `inline-review-local` separate from the original plugin. Drafts and settings use separate storage.

## [1.0.1] - 2026-09-30

- Support BB 0.44 and later while retaining BB 0.43.1 compatibility.
- Develop against Plugin SDK 0.5.29 while retaining the 0.4.87 runtime API floor.

## [1.0.0] - 2026-09-17

- Annotate native assistant-message selections with comments or removal requests.
- Keep one server-side review draft per thread and deliver it as one compact,
  numbered message.
- Highlight staged comments and removals on uniquely matched response text and
  restore them across navigation.
- Support selections across Markdown block boundaries without changing the
  rendered message DOM.
- Provide a compact mobile editor and a collapsed in-chat review banner with
  Overall feedback.
- Support Return submission for comments and Ctrl+Enter or ⌘+Enter delivery
  from Overall feedback.
- Preserve drafts on delivery failure and confirm before clearing all feedback.
