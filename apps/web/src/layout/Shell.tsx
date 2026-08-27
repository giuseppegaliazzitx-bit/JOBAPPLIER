import { NavLink, Outlet } from "react-router-dom";
import { NAV_ITEMS } from "../nav.ts";

export function Shell() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-rule bg-panel lg:border-b-0 lg:border-r">
        <div className="flex items-baseline justify-between px-5 py-5 lg:block">
          <p className="font-serif text-2xl tracking-tight">Autoapply</p>
          <p className="text-xs text-mute lg:mt-1">local-first · phase 7</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-6" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "whitespace-nowrap rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-ink text-paper" : "text-ink hover:bg-paper",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="px-5 py-6 lg:px-10 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
