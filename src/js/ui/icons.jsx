// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The icons the tabs use, drawn in the text's colour and hidden from screen readers.

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };

export const Chevron = ({ class: cls }) => <svg class={cls} {...svg}><path d="m6 9 6 6 6-6" /></svg>;
export const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
export const ExtIcon = () => <svg {...svg}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
export const PenIcon = () => <svg {...svg}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
export const TrashIcon = () => <svg {...svg}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>;
export const CopyIcon = () => <svg {...svg}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
export const CartIcon = () => <svg {...svg}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.9a1.5 1.5 0 0 0 1.5-1.1L21 7H6" /></svg>;
export const PlusIcon = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>;
export const CloseIcon = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const StarIcon = () => <svg {...svg}><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" /></svg>;
export const AddIcon = () => <svg {...svg}><path d="M3 6h11M3 12h11M3 18h7M18 14v8M14 18h8" /></svg>;
export const ListsIcon = () => <svg {...svg}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
export const SearchIcon = () => <svg {...svg}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const DupIcon = () => <svg {...svg}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>;
export const OpenIcon = () => <svg {...svg}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const RefreshIcon = () => <svg {...svg}><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></svg>;
export const DownloadIcon = () => <svg {...svg}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>;
export const UploadIcon = () => <svg {...svg}><path d="M12 21V9M7 14l5-5 5 5M4 4h16" /></svg>;
export const CheckIcon = () => <svg {...svg}><path d="M20 6 9 17l-5-5" /></svg>;
export const LockIcon = () => <svg {...svg}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const ClockIcon = () => <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const AlertIcon = () => <svg {...svg}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
export const PauseIcon = () => <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></svg>;
export const TermIcon = () => <svg {...svg}><path d="m4 17 6-6-6-6M12 19h8" /></svg>;
export const AppsIcon = () => <svg {...svg}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
export const TagIcon = () => <svg {...svg}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>;
export const GithubIcon = () => <svg {...svg}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7a5.4 5.4 0 0 0-1.5-3.8 5 5 0 0 0-.1-3.8s-1.2-.3-3.9 1.5a13.4 13.4 0 0 0-7 0C6.3 1.6 5.1 2 5.1 2A5 5 0 0 0 5 5.7a5.4 5.4 0 0 0-1.5 3.8c0 5.4 3.3 6.6 6.4 7a3.4 3.4 0 0 0-.9 2.6V22" /></svg>;
export const UpIcon = () => <svg {...svg}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
export const RelayIcon = () => <svg {...svg}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
export const UserIcon = () => <svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const DeviceIcon = () => <svg {...svg}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;
export const ChartIcon = () => <svg {...svg}><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>;
export const WebIcon = () => <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
export const BugIcon = () => <svg {...svg}><rect x="8" y="6" width="8" height="14" rx="4" /><path d="M12 20v-9M3 13h5M16 13h5M4 7l4 2M20 7l-4 2M4 19l4-2M20 19l-4-2M9 6l-1-3M15 6l1-3" /></svg>;
