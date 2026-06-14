(function () {
    const themeStorageKey = "zytholo_theme";
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let selectedTheme = "auto";

    function getSystemTheme() {
        return mediaQuery.matches ? "dark" : "light";
    }

    function getResolvedTheme() {
        return selectedTheme === "auto" ? getSystemTheme() : selectedTheme;
    }

    function applyTheme() {
        const resolvedTheme = getResolvedTheme();
        document.documentElement.setAttribute("data-theme", resolvedTheme);
        document.dispatchEvent(new CustomEvent("themeChanged", {
            detail: {
                selectedTheme,
                resolvedTheme
            }
        }));
        updateThemeButtons();
    }

    function persistTheme(theme) {
        localStorage.setItem(themeStorageKey, theme);
    }

    function getI18nLabel(key, fallbackText) {
        if (window.ZytholoI18n && typeof window.ZytholoI18n.t === "function") {
            return window.ZytholoI18n.t(key);
        }
        return fallbackText;
    }

    function updateThemeButtons() {
        const isDark = getResolvedTheme() === "dark";
        const icon = isDark ? "☀️" : "🌙";
        const labelKey = isDark ? "theme_switch_to_light" : "theme_switch_to_dark";
        const label = getI18nLabel(
            labelKey,
            isDark ? "Activer le mode clair" : "Activer le mode sombre"
        );

        document.querySelectorAll(".theme-toggle-btn").forEach((button) => {
            button.textContent = icon;
            button.title = label;
            button.setAttribute("aria-label", label);
        });
    }

    function setTheme(theme, persist = true) {
        if (!["auto", "light", "dark"].includes(theme)) return;
        selectedTheme = theme;
        if (persist) {
            persistTheme(theme);
        }
        applyTheme();
    }

    function toggleTheme() {
        const nextTheme = getResolvedTheme() === "dark" ? "light" : "dark";
        setTheme(nextTheme, true);
    }

    function bindThemeButtons() {
        document.querySelectorAll(".theme-toggle-btn").forEach((button) => {
            if (button.dataset.themeBound === "true") return;
            button.addEventListener("click", toggleTheme);
            button.dataset.themeBound = "true";
        });
        updateThemeButtons();
    }

    function initTheme() {
        const storedTheme = localStorage.getItem(themeStorageKey);
        selectedTheme = ["auto", "light", "dark"].includes(storedTheme) ? storedTheme : "auto";
        applyTheme();
        bindThemeButtons();
    }

    mediaQuery.addEventListener("change", function () {
        if (selectedTheme === "auto") {
            applyTheme();
        }
    });

    document.addEventListener("DOMContentLoaded", bindThemeButtons);
    document.addEventListener("languageChanged", updateThemeButtons);
    document.addEventListener("DOMContentLoaded", initTheme);

    window.ZytholoTheme = {
        initTheme,
        setTheme,
        toggleTheme,
        getSelectedTheme: function () { return selectedTheme; },
        getResolvedTheme
    };
})();
