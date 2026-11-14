# Design reference

The design follows [PostHog's DESIGN.md](../posthog/DESIGN.md), added with `npx getdesign@latest add posthog`. Use its tokens as written.

The live spec is [index.html](index.html). The screens are in [../mockups](../mockups).

## What we add

- **Logo:** a yellow milk carton that is also a speech bubble. It replaces PostHog's hedgehog, which belongs to PostHog.
- **Home is a chat box**, like PostHog AI: logo, one question, the composer, three suggestions.
- **App shell:** PostHog's labelled left sidebar. Mobile uses a bottom tab bar.
- **Status badges:** ORDERED (green), ASK (yellow), BLOCKED (red), UNKNOWN (outline only).
- **Prices:** raised cents, Finnish format: `1 150,40 €`, `1,01 €/l`.
- **Cut-off board:** the dark code-block surface with yellow times.

## Rules

- One yellow button per view.
- One short line of text at most beside any control. No meta labels, footnotes or helper notes.
- Show the number, the status and the action. Put the reasons in the audit log.
