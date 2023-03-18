import { Command } from "./command";
import {
    Version,
    SetAnnounceChannel,
    Disable,
    Settings,
    GetVoices,
    SetVoice,
    SetEnterAlert,
    SetExitAlert,
    Disconnect,
    Sneak,
    SneakingAllowed
} from "./commands";

export const Commands: Command[] = [
    Version,
    SetAnnounceChannel,
    Disable,
    Settings,
    GetVoices,
    SetVoice,
    SetEnterAlert,
    SetExitAlert,
    Disconnect,
    Sneak,
    SneakingAllowed
];