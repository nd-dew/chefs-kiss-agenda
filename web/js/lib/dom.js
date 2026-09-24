export const $ = (selector, root = document) => root.querySelector(selector);

export const isPhone = () => matchMedia('(max-width: 640px)').matches;
export const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
