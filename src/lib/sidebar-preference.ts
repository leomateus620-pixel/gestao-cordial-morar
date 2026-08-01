export const SIDEBAR_PREFERENCE_KEY = "gc.sidebar.collapsed.v1";

export function parseSidebarPreference(value: string | null | undefined): boolean {
  return value === "collapsed";
}

export function serializeSidebarPreference(collapsed: boolean): "collapsed" | "expanded" {
  return collapsed ? "collapsed" : "expanded";
}
