#!/usr/bin/env python3
"""Surgical edits for dashboard-shell.tsx — bypass terminal display mangling."""

PATH = "/home/z/my-project/components/shared/dashboard-shell.tsx"
src = open(PATH, encoding="utf-8").read()
orig = src

# 1) add useSession import after useTheme import
if "useSession" not in src:
    src = src.replace(
        "import { useTheme } from 'next-themes'",
        "import { useTheme } from 'next-themes'\nimport { useSession } from 'next-auth/react'",
        1,
    )

# 2) NAV_CONFIG: add profilePath to type + each role + profile nav items
src = src.replace(
    "Record<DashboardRole, { roleLabel: string; items: NavItem[] }>",
    "Record<DashboardRole, { roleLabel: string; profilePath: string; items: NavItem[] }>",
    1,
)
src = src.replace(
    "roleLabel: 'مدير النظام',\n    items:",
    "roleLabel: 'مدير النظام',\n    profilePath: '/admin/profile',\n    items:",
    1,
)
src = src.replace(
    "roleLabel: 'الكادر التمريضي',\n    items:",
    "roleLabel: 'الكادر التمريضي',\n    profilePath: '/nurse/profile',\n    items:",
    1,
)
src = src.replace(
    "roleLabel: 'المستلم الإداري',\n    items:",
    "roleLabel: 'المستلم الإداري',\n    profilePath: '/receiver/profile',\n    items:",
    1,
)

# admin: add profile nav item after settings item
src = src.replace(
    "{ href: '/admin/settings', label: 'الرسوم وطرق الدفع', icon: Settings2 },\n    ],",
    "{ href: '/admin/settings', label: 'الرسوم وطرق الدفع', icon: Settings2 },\n      { href: '/admin/profile', label: 'الملف الشخصي', icon: UserRound },\n    ],",
    1,
)
# receiver: add profile nav item
src = src.replace(
    "{ href: '/receiver/assignments', label: 'التكليفات والتقديمات', icon: Inbox },\n    ],",
    "{ href: '/receiver/assignments', label: 'التكليفات والتقديمات', icon: Inbox },\n      { href: '/receiver/profile', label: 'الملف الشخصي', icon: UserRound },\n    ],",
    1,
)

# 3) DashboardShell body: profilePath var + session
src = src.replace(
    "const { theme, setTheme } = useTheme()\n  const",
    "const { theme, setTheme } = useTheme()\n  const { data: session } = useSession()\n  const profilePath = NAV_CONFIG[role].profilePath\n  const",
    1,
)

# 4) profile menu item -> dynamic path
src = src.replace("router.push('/nurse/profile')", "router.push(profilePath)", 1)

open(PATH, "w", encoding="utf-8").write(src)

checks = [
    "useSession" in src,
    "profilePath: '/admin/profile'" in src,
    "profilePath: '/receiver/profile'" in src,
    "const profilePath = NAV_CONFIG[role].profilePath" in src,
    "router.push(profilePath)" in src,
    "href: '/admin/profile'" in src,
    "href: '/receiver/profile'" in src,
]
print("checks:", checks)
assert all(checks), "SOME EDITS FAILED"
print("ALL_EDITS_OK, changed:", src != orig)
