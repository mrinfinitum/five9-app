import type { Board } from "./types";

/** True when a board has a logo for either mode. Safe to use on the server and in the browser. */
export const hasBoardLogo = (board: Pick<Board, "logoDarkUrl" | "logoLightUrl">) => Boolean(board.logoDarkUrl || board.logoLightUrl);
