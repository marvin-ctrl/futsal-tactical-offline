import type { Drawable, UUID } from "../types/domain";
import type { EditorCommand } from "../types/ui";

export function applyCommandToDrawableState(
  drawableState: Record<UUID, Drawable>,
  command: EditorCommand
): Record<UUID, Drawable> {
  switch (command.type) {
    case "batch":
      return command.commands.reduce(
        (currentState, entry) => applyCommandToDrawableState(currentState, entry),
        drawableState
      );
    case "addDrawables": {
      const nextState = { ...drawableState };
      for (const drawable of command.drawables) {
        nextState[drawable.id] = {
          ...drawable,
          style: { ...drawable.style }
        };
      }
      return nextState;
    }
    case "updateDrawables": {
      const nextState = { ...drawableState };
      for (const update of command.updates) {
        const existing = nextState[update.id];
        if (!existing || existing.locked) {
          continue;
        }
        nextState[update.id] = {
          ...existing,
          ...update.changes,
          style: update.changes.style
            ? {
                ...existing.style,
                ...update.changes.style
              }
            : { ...existing.style }
        };
      }
      return nextState;
    }
    case "removeDrawables": {
      const nextState = { ...drawableState };
      for (const id of command.ids) {
        if (nextState[id]?.locked) {
          continue;
        }
        delete nextState[id];
      }
      return nextState;
    }
    case "setDrawableState":
      return Object.fromEntries(
        Object.entries(command.drawableState).map(([id, drawable]) => [
          id,
          {
            ...drawable,
            style: { ...drawable.style }
          }
        ])
      );
    default:
      return drawableState;
  }
}
