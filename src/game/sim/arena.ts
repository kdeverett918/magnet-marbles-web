import type { World } from "./world";
import type { NetView } from "../net/NetView";

/**
 * The renderer reads from an Arena: either the local authoritative World
 * (single-player) or a NetView mirroring the server (online). Both expose the
 * same fields + tick/setInput/flushInput/drainFx/forceAdvance surface.
 */
export type Arena = World | NetView;
