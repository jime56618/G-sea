import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  User,
  FileText,
  Calendar,
  DollarSign,
  GraduationCap,
  ClipboardList,
  LogOut,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import {
  MENU_ITEMS,
  ADMIN_MENU_ITEMS,
  filterMenuByPermissions,
} from "../utils/permissions";

import logoGSEA from "../assets/images/logo-gsea.png";
import "./css/Sidebar.css";

const PATH_ICONS = {
  "/dashboard": LayoutDashboard,
  "/tramites": ClipboardList,
  "/agentes": Users,
  "/clientes": User,
  "/seguimiento-polizas": FileText,
  "/seguimiento-cobranza": DollarSign,
  "/capacitacion": GraduationCap,
  "/calendario": Calendar,
  "/configuracion/equipo": Users,
  "/configuracion/roles": Settings,
  "/configuracion/facturacion": DollarSign,
};

function itemIcon(path) {
  const Icon = PATH_ICONS[path] || FileText;
  return <Icon size={19} strokeWidth={1.9} />;
}

export default function SidebarGSEA({ onExpand }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const location = useLocation();
  const { session, logout } = useAuth();

  const mainMenu = useMemo(
    () =>
      filterMenuByPermissions(MENU_ITEMS, session).map((item) => ({
        ...item,
        icon: itemIcon(item.path),
      })),
    [session]
  );

  const adminMenu = useMemo(
    () =>
      filterMenuByPermissions(ADMIN_MENU_ITEMS, session).map((item) => ({
        ...item,
        icon: itemIcon(item.path),
      })),
    [session]
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredMainMenu = useMemo(() => {
    if (!normalizedSearch) return mainMenu;

    return mainMenu.filter((item) =>
      item.label.toLowerCase().includes(normalizedSearch)
    );
  }, [mainMenu, normalizedSearch]);

  const filteredAdminMenu = useMemo(() => {
    if (!normalizedSearch) return adminMenu;

    return adminMenu.filter((item) =>
      item.label.toLowerCase().includes(normalizedSearch)
    );
  }, [adminMenu, normalizedSearch]);

  const toggleExpand = () => {
    const next = !isExpanded;
    setIsExpanded(next);

    if (!next) {
      setSearchTerm("");
    }

    onExpand?.(next);
  };

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: isExpanded ? 248 : 72 }}
        transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
        className={`gsea-sidebar ${isExpanded ? "is-expanded" : "is-collapsed"}`}
      >
        <div className="gsea-sidebar__header">
          <div className="gsea-sidebar__brand">
            <div className="gsea-sidebar__logo">
              <img src={logoGSEA} alt="GSEA CRM" />
            </div>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -7 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -7 }}
                  transition={{ duration: 0.16 }}
                  className="gsea-sidebar__brand-copy"
                >
                  <strong>GSEA</strong>
                  <span>CRM Platform</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={toggleExpand}
            className="gsea-sidebar__toggle"
            aria-label={isExpanded ? "Colapsar menú" : "Expandir menú"}
            title={isExpanded ? "Colapsar menú" : "Expandir menú"}
          >
            {isExpanded ? (
              <ChevronLeft size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="gsea-sidebar__search-wrap"
            >
              <div className="gsea-sidebar__search">
                <Search size={15} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar"
                  aria-label="Buscar módulo"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <nav className="gsea-sidebar__nav">
          <SidebarSectionTitle isExpanded={isExpanded}>
            Principal
          </SidebarSectionTitle>

          <div className="gsea-sidebar__list">
            {filteredMainMenu.map((item) => (
              <SidebarItem
                key={item.path}
                item={item}
                isActive={location.pathname === item.path}
                isExpanded={isExpanded}
              />
            ))}
          </div>

          {filteredAdminMenu.length > 0 && (
            <>
              <SidebarSectionTitle isExpanded={isExpanded}>
                Configuración
              </SidebarSectionTitle>

              <div className="gsea-sidebar__list">
                {filteredAdminMenu.map((item) => (
                  <SidebarItem
                    key={item.path}
                    item={item}
                    isActive={location.pathname === item.path}
                    isExpanded={isExpanded}
                  />
                ))}
              </div>
            </>
          )}

          {isExpanded &&
            normalizedSearch &&
            filteredMainMenu.length === 0 &&
            filteredAdminMenu.length === 0 && (
              <p className="gsea-sidebar__empty">
                No se encontró ningún módulo.
              </p>
            )}
        </nav>

        <div className="gsea-sidebar__footer">
          <button
            type="button"
            onClick={logout}
            className="gsea-sidebar__logout"
          >
            <span className="gsea-sidebar__item-icon">
              <LogOut size={19} strokeWidth={1.9} />
            </span>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -7 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -7 }}
                  transition={{ duration: 0.16 }}
                  className="gsea-sidebar__item-label"
                >
                  Cerrar sesión
                </motion.span>
              )}
            </AnimatePresence>

            {!isExpanded && (
              <span className="gsea-sidebar__tooltip">
                Cerrar sesión
              </span>
            )}
          </button>
        </div>
      </motion.aside>

      <div
        className="gsea-sidebar-spacer"
        style={{ marginLeft: isExpanded ? 248 : 72 }}
      />
    </>
  );
}

function SidebarSectionTitle({ isExpanded, children }) {
  if (!isExpanded) {
    return <div className="gsea-sidebar__section-gap" />;
  }

  return (
    <p className="gsea-sidebar__section-title">
      {children}
    </p>
  );
}

function SidebarItem({ item, isActive, isExpanded }) {
  return (
    <Link
      to={item.path}
      className="gsea-sidebar__link"
      aria-current={isActive ? "page" : undefined}
    >
      <motion.div
        whileTap={{ scale: 0.985 }}
        className={`gsea-sidebar__item ${isActive ? "is-active" : ""}`}
      >
        <span className="gsea-sidebar__item-icon">
          {item.icon}
        </span>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.span
              initial={{ opacity: 0, x: -7 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -7 }}
              transition={{ duration: 0.16 }}
              className="gsea-sidebar__item-label"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>

        {!isExpanded && (
          <span className="gsea-sidebar__tooltip">
            {item.label}
          </span>
        )}
      </motion.div>
    </Link>
  );
}