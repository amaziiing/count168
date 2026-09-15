import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isTypeAheadKey } from "../../../components/typeAheadMatch.js";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import { layoutPortalCustomSelect } from "../../../components/customSelectPortalLayout.js";

const SEARCH_RESERVE = 52;

/**
 * Rows mounted per page of the option list. A company (or group) scope can hold thousands of
 * accounts, and mounting every match makes each keystroke cost seconds on a phone CPU.
 */
const OPTION_WINDOW_STEP = 40;

export function AccountSelect({
  placeholder,
  options,
  value,
  onChange,
  disabled,
  profitType,
  ariaLabelledBy,
  ariaLabel,
  searchPlaceholder = "Search account...",
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [windowSize, setWindowSize] = useState(OPTION_WINDOW_STEP);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(240);
  const searchRef = useRef(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  /** Uppercased haystack per option, rebuilt only when the account list changes. */
  const searchableOptions = useMemo(() => {
    const rows = Array.isArray(options) ? options : [];
    return rows.map((row) => ({ row, hay: String(row.display_text || "").toUpperCase() }));
  }, [options]);

  const matchedOptions = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return searchableOptions;
    return searchableOptions.filter((entry) => entry.hay.includes(q));
  }, [searchableOptions, filter]);

  /** Full match set — indexes here are what keyboard selection and `data-kb-idx` refer to. */
  const filtered = useMemo(() => matchedOptions.map((entry) => entry.row), [matchedOptions]);

  /** Only a page of the match set is mounted; scrolling / keyboard navigation grows it. */
  const renderedOptions = useMemo(() => filtered.slice(0, windowSize), [filtered, windowSize]);

  const growWindow = useCallback(() => {
    setWindowSize((size) =>
      size < filtered.length ? Math.min(filtered.length, size + OPTION_WINDOW_STEP) : size,
    );
  }, [filtered.length]);

  const onOptionsScroll = useCallback(
    (e) => {
      const el = e.currentTarget;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) growWindow();
    },
    [growWindow],
  );

  const {
    highlightIdx,
    setHighlightIdx,
    listRef,
    handleListKeyDown,
    handleButtonKeyDown,
    highlightClass,
  } = useListboxKeyboard({
    open,
    itemCount: filtered.length,
    resetToken: filter,
  });

  /**
   * Keyboard navigation walks one row at a time, so the window follows it. The wrap-around jump
   * (ArrowUp on the first row of a long list) parks on the last mounted row instead of mounting
   * everything — Enter then still selects a row the user can see.
   */
  useEffect(() => {
    if (!open) return;
    const windowEnd = windowSize - 1;
    if (highlightIdx < windowEnd) return;
    if (highlightIdx - windowEnd <= 1) {
      setWindowSize((size) => Math.min(filtered.length, size + OPTION_WINDOW_STEP));
      return;
    }
    setHighlightIdx(Math.max(0, windowEnd - 1));
  }, [highlightIdx, windowSize, open, filtered.length, setHighlightIdx]);

  /** A new query starts the window over, so each keystroke only mounts one page of rows. */
  const applyFilter = useCallback(
    (next) => {
      const text = String(next ?? "");
      if (text === filter) return;
      setFilter(text);
      setWindowSize(OPTION_WINDOW_STEP);
    },
    [filter],
  );

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutPortalCustomSelect(
      btn,
      containerRef.current,
      {
        minWidth: Math.max(btn.getBoundingClientRect().width || 0, 140),
        searchReserve: SEARCH_RESERVE,
        minMenu: 160,
        dropdownCap: 300,
      },
    );
    setMenuStyle(nextStyle);
    setOptionsMaxHeight(nextOptionsMaxHeight);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    const onScroll = (e) => {
      if (dropdownRef.current?.contains(e.target)) return;
      positionMenu();
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const target = e.target;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setFilter("");
      setWindowSize(OPTION_WINDOW_STEP);
    }
  }, [open]);

  const displayText = value?.display_text ? value.display_text : placeholder;

  const pick = (opt) => {
    onChange(opt);
    close();
  };

  const openMenu = useCallback(
    (seed = "") => {
      if (disabled) return;
      setFilter(seed);
      setWindowSize(OPTION_WINDOW_STEP);
      positionMenu();
      setOpen(true);
    },
    [disabled, positionMenu],
  );

  const selectByIndex = (idx) => {
    const opt = filtered[idx];
    if (opt) pick(opt);
  };

  const onButtonKeyDown = (e) => {
    if (disabled) return;
    if (!open && isTypeAheadKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openMenu(e.key);
      return;
    }
    handleButtonKeyDown(e, {
      isOpen: open,
      onToggleOpen: () => openMenu(""),
      onClose: close,
      len: filtered.length,
      onSelectIndex: selectByIndex,
    });
  };

  const dropdownNode =
    open && menuStyle ? (
      <div
        ref={dropdownRef}
        className="custom-select-dropdown show custom-select-dropdown-portal transaction-account-select-portal"
        style={menuStyle}
        role="listbox"
      >
        <div className="custom-select-search">
          <input
            ref={searchRef}
            type="text"
            placeholder={searchPlaceholder}
            autoComplete="off"
            disabled={disabled}
            value={filter}
            onChange={(e) => applyFilter(e.target.value)}
            style={{ textTransform: "uppercase" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                close();
                return;
              }
              if (e.key === "Backspace" && !filter) {
                e.preventDefault();
                onChange?.(null);
                return;
              }
              handleListKeyDown(e, {
                len: filtered.length,
                onSelectIndex: selectByIndex,
                onClose: close,
              });
            }}
          />
        </div>
        <div
          className="custom-select-options"
          ref={listRef}
          onScroll={onOptionsScroll}
          style={{ flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight }}
        >
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            renderedOptions.map((opt, idx) => (
              <div
                key={opt.id}
                data-kb-idx={idx}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}${highlightClass(idx)}`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt.display_text}
              </div>
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="custom-select-wrapper" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || undefined}
        aria-labelledby={ariaLabel ? undefined : ariaLabelledBy || undefined}
        data-placeholder={placeholder}
        data-value={value?.id ?? ""}
        data-account-id={value?.id ?? ""}
        data-account-code={value?.account_id ?? ""}
        data-currency={
          value?.currency != null && String(value.currency).trim() !== ""
            ? String(value.currency).trim().toUpperCase()
            : ""
        }
        data-profit-type={profitType || undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close();
            return;
          }
          openMenu("");
        }}
        onKeyDown={onButtonKeyDown}
      >
        {displayText}
      </button>
      {dropdownNode && typeof document !== "undefined" ? createPortal(dropdownNode, document.body) : null}
    </div>
  );
}

export default AccountSelect;
