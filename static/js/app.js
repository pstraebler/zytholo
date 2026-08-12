const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const i18n = window.ZytholoI18n;

function t(key, vars = null) {
    if (i18n && typeof i18n.t === 'function') {
        return i18n.t(key, vars);
    }
    return key;
}

function currentLocale() {
    if (i18n && typeof i18n.getCurrentLanguage === 'function') {
        return i18n.getCurrentLanguage() === 'fr' ? 'fr-FR' : 'en-US';
    }
    return 'en-US';
}

function parseDateInputValue(value) {
    const [year, month, day] = (value || '').split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }
    return new Date(year, month - 1, day);
}

function formatDateInputValue(dateValue) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function shiftDateInputValue(value, dayOffset) {
    const parsedDate = parseDateInputValue(value);
    if (!parsedDate) {
        return null;
    }

    parsedDate.setDate(parsedDate.getDate() + dayOffset);
    return formatDateInputValue(parsedDate);
}

function getLogicalCurrentDate() {
    const now = new Date();
    const logicalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() < 7) {
        logicalDate.setDate(logicalDate.getDate() - 1);
    }
    return logicalDate;
}

function getStorageDateForSelectedDay(selectedDateValue, timeValue) {
    const selectedDate = parseDateInputValue(selectedDateValue);
    if (!selectedDate) {
        return selectedDateValue;
    }

    if ((timeValue || '00:00:00') < '07:00:00') {
        selectedDate.setDate(selectedDate.getDate() + 1);
    }

    return formatDateInputValue(selectedDate);
}

function formatDayHistoryDate(dateValue) {
    const parsedDate = parseDateInputValue(dateValue);
    if (!parsedDate) {
        return '';
    }
    return new Intl.DateTimeFormat(currentLocale(), {
        day: '2-digit',
        month: '2-digit'
    }).format(parsedDate);
}

function formatDayHistoryTime(timeValue) {
    return (timeValue || '').slice(0, 5);
}

function formatDayHistoryLiters(value) {
    return new Intl.NumberFormat(currentLocale(), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(value || 0);
}

let currentBeer = {
    pints: 0,
    half_pints: 0,
    liters_33: 0,
    custom_cl: 0
};

let monthlyChart = null;
let totalChart = null;
let bacChart = null;
let bacChartNowIndex = -1;  // index du dataset "Maintenant" dans le graphe d'alcoolémie
let savingInProgress = false;
let nightModeEnabled = false;
let lastClickTime = 0;
let weeklyChart = null;
let userMenuOpen = false;
let passwordModalCloseTimer = null;
let passwordChangeRequired = false;
let lastStatsData = null;
let showAllUsersTimeline = false;
let lastRecordEvening = null;

const averageBeerPriceStorageKey = 'zytholo_average_beer_price';
const defaultAverageBeerPrice = 6;
const averageBeerVolumeLiters = 0.5;
const defaultThreeHourThresholdLiters = 1.5;
let threeHourThresholdLiters = defaultThreeHourThresholdLiters;
const defaultWeeklyDrinkingDaysThreshold = 3;
let weeklyDrinkingDaysThreshold = defaultWeeklyDrinkingDaysThreshold;
const defaultWaterReminderThresholdLiters = 1;
let waterReminderThresholdLiters = defaultWaterReminderThresholdLiters;
const waterReminderDismissStorageKey = 'zytholo_water_reminder_dismissed';

// Réglages d'alcoolémie (estimation Widmark). Poids/sexe peuvent rester vides.
const defaultBeerAbv = 5.0;
let bacWeightKg = null;
let bacSex = null;
let bacBeerAbv = defaultBeerAbv;
const defaultBacLegalLimit = 0.5;
let bacLegalLimit = defaultBacLegalLimit;
const bacEliminationRatePerHour = 0.15;
// Ancre pour faire décroître l'affichage en continu entre deux appels serveur.
let bacAnchor = null;  // { bac, atMs, soberLegalAt, soberAt }
let bacTickTimer = null;

// Total de la soirée (en litres) au moment où l'utilisateur a validé le rappel.
// L'alerte ne réapparaît qu'après avoir bu un seuil complet de plus.
function getWaterReminderAck() {
    try {
        const raw = localStorage.getItem(waterReminderDismissStorageKey);
        if (!raw) return { key: '', total: 0 };
        const parsed = JSON.parse(raw);
        return { key: parsed.key || '', total: Number(parsed.total) || 0 };
    } catch (error) {
        return { key: '', total: 0 };
    }
}

function acknowledgeWaterReminder(eveningKey, total) {
    try {
        localStorage.setItem(
            waterReminderDismissStorageKey,
            JSON.stringify({ key: eveningKey || '', total: Number(total) || 0 })
        );
    } catch (error) {
        // Stockage indisponible : l'alerte réapparaîtra au prochain rafraîchissement.
    }
}

function getChartThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
        textColor: styles.getPropertyValue('--chart-text-color').trim() || '#2c3e50',
        gridColor: styles.getPropertyValue('--chart-grid-color').trim() || 'rgba(44, 62, 80, 0.15)'
    };
}

function getCssColor(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function colorWithAlpha(color, alpha) {
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const fullHex = hex.length === 3
            ? hex.split('').map(char => char + char).join('')
            : hex;
        const value = parseInt(fullHex, 16);
        if (Number.isFinite(value)) {
            const red = (value >> 16) & 255;
            const green = (value >> 8) & 255;
            const blue = value & 255;
            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }
    }

    return color;
}

document.addEventListener('DOMContentLoaded', function() {
    passwordChangeRequired = document.body?.dataset.forcePasswordChange === 'true';
    const today = formatDateInputValue(new Date());
    const logicalToday = formatDateInputValue(getLogicalCurrentDate());
    
    const todayInput = document.getElementById('today-date');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    
    if (todayInput) {
        todayInput.value = logicalToday;
        todayInput.addEventListener('change', function() {
            loadTodayConsumption();
        });
    }

    initDayNavigation();
    
    if (startDateInput && endDateInput) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDateInput.value = startDate.toISOString().split('T')[0];
        endDateInput.value = today;
    }
    
    if (!passwordChangeRequired) {
        refreshDashboardData();
    }
    updateStatsShortcutLabels();
    initUserMenu();
    initPasswordModal();
    initSettingsModal();
    initNightModeModal();
    initRecordNameModal();
    initWhatsNewModal();
    initTimelineModeToggle();

    document.addEventListener('languageChanged', function() {
        updateSettingsLanguageSelection();
        updateSettingsThemeSelection();
        updateStatsShortcutLabels();
        updateNightModeUI();
        if (!passwordChangeRequired) {
            loadStats();
            // La carte d'alcoolémie est pilotée par loadTodayConsumption : sans cet appel,
            // ses libellés/légende (et couleurs de thème) ne se rafraîchissent pas tout de suite.
            loadTodayConsumption();
        }
    });

    document.addEventListener('themeChanged', function() {
        updateSettingsThemeSelection();
        if (!passwordChangeRequired) {
            loadStats();
            loadTodayConsumption();
        }
    });
});

function refreshDashboardData() {
    loadTodayConsumption();
    loadNightModeStatus();
    if (typeof Chart !== 'undefined') {
        loadStats();
    } else {
        console.error('Chart.js n\'est pas chargé');
        setTimeout(loadStats, 1000);
    }
    refreshRankings();
}

function initDayNavigation() {
    const todayInput = document.getElementById('today-date');
    const previousDayButton = document.getElementById('previous-day-btn');
    const nextDayButton = document.getElementById('next-day-btn');

    if (!todayInput) {
        return;
    }

    if (previousDayButton) {
        previousDayButton.addEventListener('click', function() {
            navigateSelectedDay(-1);
        });
    }

    if (nextDayButton) {
        nextDayButton.addEventListener('click', function() {
            navigateSelectedDay(1);
        });
    }
}

function navigateSelectedDay(dayOffset) {
    const todayInput = document.getElementById('today-date');
    if (!todayInput) {
        return;
    }

    const nextValue = shiftDateInputValue(todayInput.value, dayOffset);
    if (!nextValue) {
        return;
    }

    todayInput.value = nextValue;
    loadTodayConsumption();
}

function initUserMenu() {
    const toggleBtn = document.getElementById('user-menu-toggle');
    const dropdown = document.getElementById('user-menu-dropdown');
    if (!toggleBtn || !dropdown) return;

    toggleBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        setUserMenuOpen(!userMenuOpen);
    });

    document.addEventListener('click', function(event) {
        if (!userMenuOpen) return;
        if (!dropdown.contains(event.target) && !toggleBtn.contains(event.target)) {
            setUserMenuOpen(false);
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && userMenuOpen) {
            setUserMenuOpen(false);
        }
    });
}

function initPasswordModal() {
    const modal = document.getElementById('password-modal');
    const openBtn = document.getElementById('change-password-menu-item');
    const closeBtn = document.getElementById('password-modal-close');
    const cancelBtn = document.getElementById('password-modal-cancel');
    const form = document.getElementById('change-password-form');

    if (!modal || !openBtn || !form) return;

    openBtn.addEventListener('click', function() {
        setUserMenuOpen(false);
        openPasswordModal();
    });

    [closeBtn, cancelBtn].forEach(function(button) {
        if (button) {
            button.addEventListener('click', closePasswordModal);
        }
    });

    modal.addEventListener('click', function(event) {
        if (!passwordChangeRequired && event.target === modal) {
            closePasswordModal();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (!passwordChangeRequired && event.key === 'Escape' && modal.classList.contains('open')) {
            closePasswordModal();
        }
    });

    form.addEventListener('submit', submitPasswordForm);

    if (passwordChangeRequired) {
        openPasswordModal();
    }
}

function initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('settings-menu-item');
    const closeBtn = document.getElementById('settings-modal-close');
    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', function() {
        setUserMenuOpen(false);
        openSettingsModal();
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsModal);
    }

    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeSettingsModal();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeSettingsModal();
        }
    });

    document.querySelectorAll('[data-settings-language]').forEach(function(button) {
        button.addEventListener('click', function() {
            if (i18n && typeof i18n.setLanguage === 'function') {
                i18n.setLanguage(button.dataset.settingsLanguage);
            }
        });
    });

    document.querySelectorAll('[data-settings-theme]').forEach(function(button) {
        button.addEventListener('click', function() {
            if (window.ZytholoTheme && typeof window.ZytholoTheme.setTheme === 'function') {
                window.ZytholoTheme.setTheme(button.dataset.settingsTheme);
            }
        });
    });

    const averageBeerPriceInput = document.getElementById('average-beer-price');
    if (averageBeerPriceInput) {
        updateAverageBeerPriceInput();
        averageBeerPriceInput.addEventListener('input', function() {
            const price = parseFloat(averageBeerPriceInput.value.replace(',', '.'));
            if (!Number.isFinite(price) || price < 0) {
                return;
            }

            setAverageBeerPrice(price);
            if (lastStatsData) {
                updateEstimatedCost(lastStatsData.total_liters);
            }
        });
    }

    const threeHourThresholdInput = document.getElementById('three-hour-threshold');
    if (threeHourThresholdInput) {
        updateThreeHourThresholdInput();
        threeHourThresholdInput.addEventListener('change', saveSettings);
        threeHourThresholdInput.addEventListener('blur', saveSettings);
    }

    const weeklyDaysThresholdInput = document.getElementById('weekly-days-threshold');
    if (weeklyDaysThresholdInput) {
        updateWeeklyDaysThresholdInput();
        weeklyDaysThresholdInput.addEventListener('change', saveSettings);
        weeklyDaysThresholdInput.addEventListener('blur', saveSettings);
    }

    const waterReminderThresholdInput = document.getElementById('water-reminder-threshold');
    if (waterReminderThresholdInput) {
        updateWaterReminderThresholdInput();
        waterReminderThresholdInput.addEventListener('change', saveSettings);
        waterReminderThresholdInput.addEventListener('blur', saveSettings);
    }

    const bacWeightInput = document.getElementById('bac-weight');
    if (bacWeightInput) {
        bacWeightInput.addEventListener('change', saveBacProfile);
        bacWeightInput.addEventListener('blur', saveBacProfile);
    }
    const bacSexInput = document.getElementById('bac-sex');
    if (bacSexInput) {
        bacSexInput.addEventListener('change', saveBacProfile);
    }
    const bacBeerAbvInput = document.getElementById('bac-beer-abv');
    if (bacBeerAbvInput) {
        bacBeerAbvInput.addEventListener('change', saveBacProfile);
        bacBeerAbvInput.addEventListener('blur', saveBacProfile);
    }
    const bacLegalLimitInput = document.getElementById('bac-legal-limit');
    if (bacLegalLimitInput) {
        bacLegalLimitInput.addEventListener('change', saveBacProfile);
        bacLegalLimitInput.addEventListener('blur', saveBacProfile);
    }
    updateBacProfileInputs();

    const bacOpenSettingsBtn = document.getElementById('bac-open-settings');
    if (bacOpenSettingsBtn) {
        bacOpenSettingsBtn.addEventListener('click', openSettingsModal);
    }

    updateSettingsLanguageSelection();
    updateSettingsThemeSelection();
    updateAverageBeerPriceInput();
    loadSettings();
}

function initNightModeModal() {
    const modal = document.getElementById('night-mode-modal');
    const closeBtn = document.getElementById('night-mode-modal-close');
    const cancelBtn = document.getElementById('night-mode-modal-cancel');
    const activateBtn = document.getElementById('night-mode-modal-activate');

    if (!modal) return;

    [closeBtn, cancelBtn].forEach(function(button) {
        if (button) {
            button.addEventListener('click', closeNightModeConfirmModal);
        }
    });

    if (activateBtn) {
        activateBtn.addEventListener('click', activateNightMode);
    }

    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeNightModeConfirmModal();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeNightModeConfirmModal();
        }
    });
}

function initTimelineModeToggle() {
    const toggle = document.getElementById('timeline-mode-toggle');
    if (!toggle) return;

    toggle.checked = showAllUsersTimeline;
    toggle.addEventListener('change', function() {
        showAllUsersTimeline = toggle.checked;
        if (lastStatsData) {
            updateTotalChart(
                lastStatsData.records || [],
                lastStatsData.all_user_records || [],
                lastStatsData.all_users || [],
                lastStatsData.current_username || ''
            );
        }
    });
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    updateSettingsLanguageSelection();
    updateAverageBeerPriceInput();
    updateThreeHourThresholdInput();
    updateWeeklyDaysThresholdInput();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    modal.querySelector('.settings-language-button.active')?.focus();
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function updateSettingsLanguageSelection() {
    if (!i18n || typeof i18n.getCurrentLanguage !== 'function') return;

    const currentLanguage = i18n.getCurrentLanguage();
    document.querySelectorAll('[data-settings-language]').forEach(function(button) {
        const active = button.dataset.settingsLanguage === currentLanguage;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function updateSettingsThemeSelection() {
    if (!window.ZytholoTheme || typeof window.ZytholoTheme.getSelectedTheme !== 'function') return;

    const selectedTheme = window.ZytholoTheme.getSelectedTheme();
    document.querySelectorAll('[data-settings-theme]').forEach(function(button) {
        const active = button.dataset.settingsTheme === selectedTheme;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function getAverageBeerPrice() {
    const storedPrice = parseFloat(localStorage.getItem(averageBeerPriceStorageKey));
    if (Number.isFinite(storedPrice) && storedPrice >= 0) {
        return storedPrice;
    }
    return defaultAverageBeerPrice;
}

function setAverageBeerPrice(price) {
    localStorage.setItem(averageBeerPriceStorageKey, price.toString());
}

function formatPriceInputValue(price) {
    return Number(price).toFixed(2);
}

function updateAverageBeerPriceInput() {
    const input = document.getElementById('average-beer-price');
    if (input && document.activeElement !== input) {
        input.value = formatPriceInputValue(getAverageBeerPrice());
    }
}

function updateThreeHourThresholdInput() {
    const input = document.getElementById('three-hour-threshold');
    if (input && document.activeElement !== input) {
        input.value = Number(threeHourThresholdLiters).toFixed(2);
    }
}

function updateWeeklyDaysThresholdInput() {
    const input = document.getElementById('weekly-days-threshold');
    if (input && document.activeElement !== input) {
        input.value = weeklyDrinkingDaysThreshold;
    }
}

function updateWaterReminderThresholdInput() {
    const input = document.getElementById('water-reminder-threshold');
    if (input && document.activeElement !== input) {
        input.value = Number(waterReminderThresholdLiters).toFixed(2);
    }
}

function updateBacProfileInputs() {
    const weightInput = document.getElementById('bac-weight');
    if (weightInput && document.activeElement !== weightInput) {
        weightInput.value = bacWeightKg != null ? String(bacWeightKg) : '';
    }
    const sexInput = document.getElementById('bac-sex');
    if (sexInput && document.activeElement !== sexInput) {
        sexInput.value = bacSex || '';
    }
    const abvInput = document.getElementById('bac-beer-abv');
    if (abvInput && document.activeElement !== abvInput) {
        abvInput.value = Number(bacBeerAbv).toFixed(1);
    }
    const legalLimitInput = document.getElementById('bac-legal-limit');
    if (legalLimitInput && document.activeElement !== legalLimitInput) {
        legalLimitInput.value = Number(bacLegalLimit).toFixed(1);
    }
}

function applySettings(settings) {
    // Une valeur de 0 désactive l'alerte correspondante.
    const threshold = parseFloat(settings?.three_hour_threshold_liters);
    if (Number.isFinite(threshold) && (threshold === 0 || (threshold >= 0.1 && threshold <= 10))) {
        threeHourThresholdLiters = threshold;
    }

    const weeklyThreshold = parseInt(settings?.weekly_drinking_days_threshold, 10);
    if (Number.isInteger(weeklyThreshold) && (weeklyThreshold === 0 || (weeklyThreshold >= 2 && weeklyThreshold <= 7))) {
        weeklyDrinkingDaysThreshold = weeklyThreshold;
    }

    const waterThreshold = parseFloat(settings?.water_reminder_threshold_liters);
    if (Number.isFinite(waterThreshold) && (waterThreshold === 0 || (waterThreshold >= 0.1 && waterThreshold <= 10))) {
        waterReminderThresholdLiters = waterThreshold;
    }

    const weight = parseFloat(settings?.weight_kg);
    bacWeightKg = (Number.isFinite(weight) && weight >= 30 && weight <= 250) ? weight : null;

    bacSex = (settings?.sex === 'm' || settings?.sex === 'f') ? settings.sex : null;

    const abv = parseFloat(settings?.beer_abv);
    bacBeerAbv = (Number.isFinite(abv) && abv >= 1 && abv <= 20) ? abv : defaultBeerAbv;

    const legalLimit = parseFloat(settings?.legal_bac_limit);
    bacLegalLimit = (Number.isFinite(legalLimit) && legalLimit >= 0 && legalLimit <= 2) ? legalLimit : defaultBacLegalLimit;

    updateThreeHourThresholdInput();
    updateWeeklyDaysThresholdInput();
    updateWaterReminderThresholdInput();
    updateBacProfileInputs();
}

function loadSettings() {
    if (passwordChangeRequired) return;

    fetch('/api/settings')
        .then(response => response.json())
        .then(applySettings)
        .catch(error => console.error('Settings error:', error));
}

function saveSettings() {
    const threeHourInput = document.getElementById('three-hour-threshold');
    const weeklyDaysInput = document.getElementById('weekly-days-threshold');
    const waterReminderInput = document.getElementById('water-reminder-threshold');
    if (!threeHourInput || !weeklyDaysInput || !waterReminderInput) return;

    const threeHourThreshold = parseFloat(threeHourInput.value.replace(',', '.'));
    let weeklyDaysThreshold = parseInt(weeklyDaysInput.value, 10);
    const waterReminderThreshold = parseFloat(waterReminderInput.value.replace(',', '.'));
    // Les valeurs valides sont 0 (désactivé) ou 2 à 7 : on comble le « trou »
    // du 1 pour que les flèches passent directement de 2 à 0 et de 0 à 2.
    if (weeklyDaysThreshold === 1) {
        weeklyDaysThreshold = weeklyDrinkingDaysThreshold === 0 ? 2 : 0;
        weeklyDaysInput.value = weeklyDaysThreshold;
    }
    // Une valeur de 0 désactive l'alerte correspondante.
    if (
        !Number.isFinite(threeHourThreshold)
        || !(threeHourThreshold === 0 || (threeHourThreshold >= 0.1 && threeHourThreshold <= 10))
        || !Number.isInteger(weeklyDaysThreshold)
        || !(weeklyDaysThreshold === 0 || (weeklyDaysThreshold >= 2 && weeklyDaysThreshold <= 7))
        || !Number.isFinite(waterReminderThreshold)
        || !(waterReminderThreshold === 0 || (waterReminderThreshold >= 0.1 && waterReminderThreshold <= 10))
    ) {
        updateThreeHourThresholdInput();
        updateWeeklyDaysThresholdInput();
        updateWaterReminderThresholdInput();
        return;
    }

    if (
        Math.abs(threeHourThreshold - threeHourThresholdLiters) < 0.001
        && weeklyDaysThreshold === weeklyDrinkingDaysThreshold
        && Math.abs(waterReminderThreshold - waterReminderThresholdLiters) < 0.001
    ) {
        updateThreeHourThresholdInput();
        updateWeeklyDaysThresholdInput();
        updateWaterReminderThresholdInput();
        return;
    }

    fetch('/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            three_hour_threshold_liters: threeHourThreshold,
            weekly_drinking_days_threshold: weeklyDaysThreshold,
            water_reminder_threshold_liters: waterReminderThreshold
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Settings update failed');
        }
        return response.json();
    })
    .then(data => {
        applySettings(data);
        loadStats();
    })
    .catch(error => {
        console.error('Settings error:', error);
        updateThreeHourThresholdInput();
        updateWeeklyDaysThresholdInput();
        updateWaterReminderThresholdInput();
        alert(t('error_settings_update'));
    });
}

function saveBacProfile() {
    const weightInput = document.getElementById('bac-weight');
    const sexInput = document.getElementById('bac-sex');
    const abvInput = document.getElementById('bac-beer-abv');
    if (!weightInput || !sexInput || !abvInput) return;

    const rawWeight = weightInput.value.replace(',', '.').trim();
    let weightKg = null;
    if (rawWeight !== '') {
        const parsedWeight = parseFloat(rawWeight);
        if (!Number.isFinite(parsedWeight)) {
            updateBacProfileInputs();
            return;
        }
        // 0 (comme un champ vide) desactive l'estimation d'alcoolemie.
        if (parsedWeight !== 0) {
            if (parsedWeight < 30 || parsedWeight > 250) {
                updateBacProfileInputs();
                return;
            }
            weightKg = Math.round(parsedWeight * 10) / 10;
        }
    }

    const sex = (sexInput.value === 'm' || sexInput.value === 'f') ? sexInput.value : '';

    const beerAbv = parseFloat(abvInput.value.replace(',', '.'));
    if (!Number.isFinite(beerAbv) || beerAbv < 1 || beerAbv > 20) {
        updateBacProfileInputs();
        return;
    }
    const roundedAbv = Math.round(beerAbv * 10) / 10;

    const legalLimitInput = document.getElementById('bac-legal-limit');
    const legalLimit = parseFloat((legalLimitInput?.value || '').replace(',', '.'));
    if (!Number.isFinite(legalLimit) || legalLimit < 0 || legalLimit > 2) {
        updateBacProfileInputs();
        return;
    }
    const roundedLegalLimit = Math.round(legalLimit * 100) / 100;

    // Rien à envoyer si aucune valeur n'a changé.
    if (
        weightKg === bacWeightKg
        && sex === (bacSex || '')
        && Math.abs(roundedAbv - bacBeerAbv) < 0.001
        && Math.abs(roundedLegalLimit - bacLegalLimit) < 0.001
    ) {
        updateBacProfileInputs();
        return;
    }

    fetch('/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            weight_kg: weightKg,
            sex: sex,
            beer_abv: roundedAbv,
            legal_bac_limit: roundedLegalLimit
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Settings update failed');
        }
        return response.json();
    })
    .then(data => {
        applySettings(data);
        loadStats();
    })
    .catch(error => {
        console.error('Settings error:', error);
        updateBacProfileInputs();
        alert(t('error_settings_update'));
    });
}

function openPasswordModal() {
    const modal = document.getElementById('password-modal');
    const dialog = document.querySelector('#password-modal .password-modal-dialog');
    const currentPasswordInput = document.getElementById('current_password');
    if (!modal) return;

    clearPasswordModalCloseTimer();
    setPasswordModalSuccessOnly(false);
    resetPasswordMessages();
    modal.classList.add('open');
    dialog?.classList.toggle('required', passwordChangeRequired);
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    if (currentPasswordInput) {
        currentPasswordInput.required = !passwordChangeRequired;
        currentPasswordInput.value = '';
    }

    document.getElementById(passwordChangeRequired ? 'new_password' : 'current_password')?.focus();
}

function closePasswordModal() {
    const modal = document.getElementById('password-modal');
    const dialog = document.querySelector('#password-modal .password-modal-dialog');
    const currentPasswordInput = document.getElementById('current_password');
    const form = document.getElementById('change-password-form');
    if (!modal) return;

    clearPasswordModalCloseTimer();
    modal.classList.remove('open');
    dialog?.classList.remove('required');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    form?.reset();
    if (currentPasswordInput) {
        currentPasswordInput.required = true;
    }
    setPasswordModalSuccessOnly(false);
    resetPasswordMessages();
}

function resetPasswordMessages() {
    const errorBox = document.getElementById('password-modal-error');
    const successBox = document.getElementById('password-modal-success');

    [errorBox, successBox].forEach(function(box) {
        if (box) {
            box.textContent = '';
            box.style.display = 'none';
        }
    });
}

function clearPasswordModalCloseTimer() {
    if (passwordModalCloseTimer) {
        clearTimeout(passwordModalCloseTimer);
        passwordModalCloseTimer = null;
    }
}

function setPasswordModalSuccessOnly(enabled) {
    const dialog = document.querySelector('#password-modal .password-modal-dialog');
    if (dialog) {
        dialog.classList.toggle('success-only', enabled);
    }
}

function showPasswordMessage(type, message) {
    const box = document.getElementById(type === 'success' ? 'password-modal-success' : 'password-modal-error');
    if (!box) return;

    box.textContent = message;
    box.style.display = 'block';
}

function submitPasswordForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submitBtn = document.getElementById('change-password-submit');
    resetPasswordMessages();

    if (submitBtn) {
        submitBtn.disabled = true;
    }

    fetch(form.action, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        body: new FormData(form)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            passwordChangeRequired = false;
            document.body.dataset.forcePasswordChange = 'false';
            form.reset();
            refreshDashboardData();
            setPasswordModalSuccessOnly(true);
            showPasswordMessage('success', data.message);
            passwordModalCloseTimer = setTimeout(closePasswordModal, 2500);
            return;
        }

        showPasswordMessage('error', data.message || t('error_generic_update'));
    })
    .catch(error => {
        console.error('Error:', error);
        showPasswordMessage('error', t('error_generic_update'));
    })
    .finally(() => {
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    });
}

function setUserMenuOpen(open) {
    const toggleBtn = document.getElementById('user-menu-toggle');
    const dropdown = document.getElementById('user-menu-dropdown');
    if (!toggleBtn || !dropdown) return;

    userMenuOpen = open;
    dropdown.classList.toggle('open', open);
    dropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function loadNightModeStatus() {
    if (passwordChangeRequired) return;

    fetch('/api/night-mode')
        .then(response => response.json())
        .then(data => {
            nightModeEnabled = data.night_mode_enabled;
            updateNightModeUI();
        })
        .catch(error => console.error('Error:', error));
}

function closeNightModeConfirmModal() {
    const modal = document.getElementById('night-mode-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function openNightModeConfirmModal() {
    const modal = document.getElementById('night-mode-modal');
    if (!modal) return;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.getElementById('night-mode-modal-activate')?.focus();
}

function toggleNightMode() {
    if (!nightModeEnabled) {
        openNightModeConfirmModal();
    }
}

function activateNightMode() {
    fetch('/api/night-mode', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ enabled: true })
    })
    .then(response => response.json())
    .then(data => {
        nightModeEnabled = true;
        updateNightModeUI();
        closeNightModeConfirmModal();
        showNightModeNotification();
    })
    .catch(error => {
        console.error('Error:', error);
        alert(t('error_night_mode_activation'));
    });
}

function updateNightModeUI() {
    const nightModeBtn = document.getElementById('night-mode-btn');
    const dateInput = document.getElementById('today-date');
    
    if (nightModeBtn) {
        if (nightModeEnabled) {
            nightModeBtn.textContent = t('night_mode_active');
            nightModeBtn.classList.add('active');
            nightModeBtn.disabled = true;
        } else {
            nightModeBtn.textContent = t('night_mode_activate');
            nightModeBtn.classList.remove('active');
            nightModeBtn.disabled = false;
        }
    }
    
    if (dateInput) {
        dateInput.disabled = nightModeEnabled;
    }

    const prevDayBtn = document.getElementById('previous-day-btn');
    const nextDayBtn = document.getElementById('next-day-btn');
    if (prevDayBtn) prevDayBtn.disabled = nightModeEnabled;
    if (nextDayBtn) nextDayBtn.disabled = nightModeEnabled;

    const historyList = document.getElementById('day-history-list');
    if (historyList) {
        historyList.classList.toggle('night-mode-active', nightModeEnabled);
    }
}

function showNightModeNotification() {
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #e74c3c;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
    `;
    
    notificationDiv.innerHTML = t('night_mode_notification');
    
    document.body.appendChild(notificationDiv);
    
    setTimeout(() => {
        notificationDiv.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notificationDiv.remove(), 300);
    }, 3000);
}

// Modifie la fonction changeBeer pour empêcher la décrémentation en mode soirée :
function changeBeer(type, value) {
  const now = Date.now();
  if (now - lastClickTime < 3000) {
    return; // Ignore le clic si moins de 3 secondes
  }
  lastClickTime = now;

  // Sécurité : empêcher toute valeur négative
  if (value < 0) {
    return;
  }

  currentBeer[type] = currentBeer[type] + value;
  document.getElementById(type + '-count').innerText = currentBeer[type];
  saveBeerAutomatic(type, value);
}

function addCustomBeer() {
  const input = document.getElementById('custom-cl-input');
  const customCl = parseInt(input.value);

  if (!customCl || customCl <= 0 || customCl > 500) {
    alert('Veuillez entrer une quantité valide entre 1 et 500 cl');
    return;
  }

  const now = Date.now();
  if (now - lastClickTime < 3000) {
    return;
  }
  lastClickTime = now;

  currentBeer.custom_cl = currentBeer.custom_cl + customCl;
  saveBeerAutomatic('custom_cl', customCl);

  // Réinitialiser le champ après ajout
  input.value = '';
}

function showNightModeDecrementNotification() {
  const notificationDiv = document.createElement('div');
  notificationDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #e74c3c;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    z-index: 9999;
    font-weight: bold;
    animation: slideIn 0.3s ease-out;
  `;
  notificationDiv.innerText = t('night_mode_block_decrement');
  document.body.appendChild(notificationDiv);
  
  setTimeout(() => {
    notificationDiv.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notificationDiv.remove(), 300);
  }, 5000);
}


// Charger la consommation du jour entier (tous créneaux)
function loadTodayConsumption() {
    if (passwordChangeRequired) return;

    const selectedDate = document.getElementById('today-date').value;

    console.log('Chargement de la consommation pour:', selectedDate);

    // Décalage UTC du navigateur : permet au serveur de savoir si le jour affiché est la
    // journée en cours (estimation d'alcoolémie en direct) ou une journée passée (résumé).
    const tzOffset = -new Date().getTimezoneOffset();
    fetch(`/api/day-history?date=${selectedDate}&tz_offset=${tzOffset}`)
        .then(response => response.json())
        .then(data => {
            currentBeer = {
                pints: data.total_pints || 0,
                half_pints: data.total_half_pints || 0,
                liters_33: data.total_33cl || 0,
                custom_cl: data.total_custom_cl || 0
            };

            console.log('Consommation totale du jour logique:', currentBeer);

            document.getElementById('pints-count').innerText = currentBeer.pints;
            document.getElementById('half_pints-count').innerText = currentBeer.half_pints;
            document.getElementById('liters_33-count').innerText = currentBeer.liters_33;
            renderDayHistory(data);
            // La carte d'alcoolémie suit désormais le jour sélectionné (et non la plage de stats).
            renderBac(data.bac_estimate);
        })
        .catch(error => {
            console.error('Error while loading:', error);
        });
}

function renderDayHistory(data) {
    const listElement = document.getElementById('day-history-list');
    const totalElement = document.getElementById('day-history-total');

    if (!listElement || !totalElement) {
        return;
    }

    totalElement.textContent = `${formatDayHistoryLiters(data.total_liters)} L`;

    if (!data.records || data.records.length === 0) {
        listElement.innerHTML = `<p class="day-history-empty">${t('day_history_empty')}</p>`;
        return;
    }

    listElement.innerHTML = data.records.map(record => {
        const quantityBadges = [];

        if (record.pints) {
            quantityBadges.push(`<span class="day-history-badge">🍺 ${record.pints}</span>`);
        }
        if (record.half_pints) {
            quantityBadges.push(`<span class="day-history-badge">🍻 ${record.half_pints}</span>`);
        }
        if (record.liters_33) {
            quantityBadges.push(`<span class="day-history-badge">🥃 ${record.liters_33}</span>`);
        }
        if (record.custom_cl) {
            quantityBadges.push(`<span class="day-history-badge">📏 ${record.custom_cl}cl</span>`);
        }

        const nextDayLabel = record.logical_day_offset === 1
            ? `<span class="day-history-offset">${t('day_history_next_day')}</span>`
            : '';

        const deleteButton = `<button class="day-history-delete" onclick="deleteHistoryItem(${record.id})" title="${t('delete')}">×</button>`;

        return `
            <div class="day-history-item">
                <div class="day-history-item-main">
                    <span class="day-history-time">${formatDayHistoryTime(record.time)}</span>
                    ${nextDayLabel}
                    <div class="day-history-badges">${quantityBadges.join('')}</div>
                </div>
                <span class="day-history-liters">${formatDayHistoryLiters(record.total_liters)} L</span>
                ${deleteButton}
            </div>
        `;
    }).join('');
}

// Supprimer une entrée de l'historique du jour
function deleteHistoryItem(recordId) {
    console.log('Attempting to delete record with ID:', recordId);

    if (!confirm(t('confirm_delete_history'))) {
        return;
    }

    fetch(`/api/consumption/${recordId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        }
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Response data:', data);
        if (data.success) {
            // Rafraîchir l'historique du jour et les compteurs
            loadTodayConsumption();
            loadStats();
        } else {
            alert(data.message || t('error_delete_history'));
        }
    })
    .catch(error => {
        console.error('Error deleting history item:', error);
        alert(t('error_delete_history'));
    });
}

// Enregistrer automatiquement avec heure actuelle
function saveBeerAutomatic(type, value) {
    if (savingInProgress) return;

    savingInProgress = true;

    const date = document.getElementById('today-date').value;
    const now = new Date();
    const time = now.toTimeString().slice(0, 8); // HH:MM:SS
    const storageDate = getStorageDateForSelectedDay(date, time);

    const payload = {
        date: storageDate,
        time: time,
        pints: type === 'pints' ? value : 0,
        half_pints: type === 'half_pints' ? value : 0,
        liters_33: type === 'liters_33' ? value : 0,
        custom_cl: type === 'custom_cl' ? value : 0
    };
    
    fetch('/api/consumption', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        showSaveNotification(type, value);
        loadTodayConsumption();
        loadStats();
        refreshRankings();
        savingInProgress = false;
    })
    .catch(error => {
        console.error('Error:', error);
        savingInProgress = false;
        currentBeer[type] = Math.max(0, currentBeer[type] - value);
        document.getElementById(`${type}-count`).innerText = currentBeer[type];
        alert(t('error_save_connection'));
    });
}

function renderPodium(container, podium, hasDrinks = true, emptyMessageKey = null) {
    if (!container) return;

    container.innerHTML = '';

    if (!hasDrinks) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'ranking-empty-message';
        emptyMessage.textContent = t(emptyMessageKey);
        container.appendChild(emptyMessage);
        return;
    }

    podium.forEach(group => {
        const trophyCard = document.createElement('div');
        trophyCard.className = `trophy-card trophy-${group.medal_index}`;

        const usersHtml = (group.users || [])
            .map(user => `<div class="trophy-user">${user.username}</div>`)
            .join('');

        trophyCard.innerHTML = `
            <div class="trophy-badge">${group.medal_index}</div>
            ${usersHtml}
            <div class="trophy-liters">${group.total_liters || 0} L</div>
        `;

        container.appendChild(trophyCard);
    });
}

function renderOtherRankings(section, others = [], hasDrinks = true) {
    if (!section) return;

    if (!hasDrinks) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    const existingTable = section.querySelector('.other-ranking-table');
    const existingEmpty = section.querySelector('.other-ranking-empty');

    if (!others.length) {
        if (existingTable) {
            existingTable.remove();
        }
        if (!existingEmpty) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'ranking-empty-message other-ranking-empty';
            emptyMessage.setAttribute('data-i18n', 'ranking_others_empty');
            emptyMessage.textContent = t('ranking_others_empty');
            section.appendChild(emptyMessage);
        } else {
            existingEmpty.textContent = t('ranking_others_empty');
        }
        return;
    }

    if (existingEmpty) {
        existingEmpty.remove();
    }

    if (!existingTable) {
        const table = document.createElement('table');
        table.className = 'ranking-table other-ranking-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th data-i18n="rank">${t('rank')}</th>
                    <th data-i18n="user">${t('user')}</th>
                    <th data-i18n="liters_total_short">${t('liters_total_short')}</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        section.appendChild(table);
    }

    const tbody = section.querySelector('.other-ranking-table tbody');
    tbody.innerHTML = others
        .map(drinker => `
            <tr>
                <td>${drinker.rank}</td>
                <td>${drinker.username}</td>
                <td>${drinker.total_liters} L</td>
            </tr>
        `)
        .join('');
}

function refreshRankings() {
    if (passwordChangeRequired) return;

    fetch('/api/rankings')
        .then(response => response.json())
        .then(data => {
            const weeklyCard = document.getElementById('weekly-ranking-card');
            const monthlyCard = document.getElementById('monthly-ranking-card');
            const yearlyCard = document.getElementById('yearly-ranking-card');
            const weeklyPodium = document.getElementById('weekly-ranking-podium');
            const monthlyPodium = document.getElementById('monthly-ranking-podium');
            const yearlyPodium = document.getElementById('yearly-ranking-podium');
            const weeklyOtherSection = document.getElementById('weekly-other-ranking-section');
            const monthlyOtherSection = document.getElementById('monthly-other-ranking-section');
            const yearlyOtherSection = document.getElementById('yearly-other-ranking-section');

            if (weeklyCard) {
                weeklyCard.style.display = data.show_weekly_ranking ? '' : 'none';
            }
            if (monthlyCard) {
                monthlyCard.style.display = data.show_monthly_ranking ? '' : 'none';
            }
            if (yearlyCard) {
                yearlyCard.style.display = data.show_ranking ? '' : 'none';
            }

            renderPodium(weeklyPodium, data.weekly_podium || [], data.weekly_has_drinks, 'ranking_empty_week');
            renderPodium(monthlyPodium, data.monthly_podium || [], data.monthly_has_drinks, 'ranking_empty_month');
            renderPodium(yearlyPodium, data.yearly_podium || [], data.yearly_has_drinks, 'ranking_empty_year');
            renderOtherRankings(weeklyOtherSection, data.weekly_others || [], data.weekly_has_drinks);
            renderOtherRankings(monthlyOtherSection, data.monthly_others || [], data.monthly_has_drinks);
            renderOtherRankings(yearlyOtherSection, data.yearly_others || [], data.yearly_has_drinks);
        })
        .catch(error => console.error('Error while refreshing rankings:', error));
}

function showSaveNotification(type, value) {
    const beerLabels = {
        'pints': t('pints'),
        'half_pints': t('halves'),
        'liters_33': '33cl',
        'custom_cl': 'Perso'
    };

    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #27ae60;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        z-index: 9999;
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
    `;

    const symbol = value > 0 ? '✅' : '❌';
    let message;
    if (type === 'custom_cl') {
        message = `${symbol} ${value > 0 ? '+' : ''}${value}cl`;
    } else {
        message = `${symbol} ${beerLabels[type]} ${value > 0 ? '+' : ''}${value}`;
    }
    notificationDiv.innerText = message;
    
    document.body.appendChild(notificationDiv);
    
    setTimeout(() => {
        notificationDiv.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notificationDiv.remove(), 300);
    }, 2000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

function loadStats() {
    if (passwordChangeRequired) return;

    const { startDate, endDate } = clampStatsDateInputs();
    updateTotalTimelineTitle(startDate, endDate);

    // Décalage UTC du navigateur (minutes à l'est) : permet au serveur d'estimer
    // l'alcoolémie à l'heure locale du client, quel que soit son fuseau.
    const tzOffset = -new Date().getTimezoneOffset();
    const url = `/api/consumption?start_date=${startDate}&end_date=${endDate}&tz_offset=${tzOffset}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.settings) {
                applySettings(data.settings);
            }
            updateStatsDisplay(data);
            updateCharts(data);
        })
        .catch(error => console.error('Error:', error));
}

function formatSelectedDate(dateValue) {
    if (!dateValue) return '';
    const date = new Date(`${dateValue}T00:00:00`);
    return date.toLocaleDateString(currentLocale());
}

function formatRecordTimeRange(startTime, endTime) {
    if (!startTime || !endTime) return '';
    if (startTime === endTime) return formatTime(startTime);
    return `${formatTime(startTime)} → ${formatTime(endTime)}`;
}

function formatBestEveningEntryItems(entry) {
    const items = [];

    if (entry.pints) {
        items.push(`${entry.pints} ${t('pints')}`);
    }
    if (entry.half_pints) {
        items.push(`${entry.half_pints} ${t('halves')}`);
    }
    if (entry.liters_33) {
        items.push(`${entry.liters_33} 33 cL`);
    }

    return items;
}

function renderBestEveningTooltip(bestEvening) {
    const cardEl = document.getElementById('best-evening-card');
    const tooltipEl = document.getElementById('best-evening-tooltip');

    if (!cardEl || !tooltipEl) return;

    const entries = Array.isArray(bestEvening?.entries) ? bestEvening.entries : [];
    const hasEntries = entries.length > 0;

    cardEl.classList.toggle('tooltip-visible', false);
    cardEl.classList.toggle('has-tooltip', hasEntries);
    tooltipEl.setAttribute('aria-hidden', hasEntries ? 'false' : 'true');

    if (!hasEntries) {
        cardEl.removeAttribute('tabindex');
        cardEl.removeAttribute('aria-describedby');
        tooltipEl.innerHTML = '';
        return;
    }

    cardEl.setAttribute('tabindex', '0');
    cardEl.setAttribute('aria-describedby', 'best-evening-tooltip');

    const rows = entries.map(entry => {
        const itemLabels = formatBestEveningEntryItems(entry)
            .map(item => `<span>${item}</span>`)
            .join('');

        return `
            <div class="stat-record-tooltip-row">
                <span class="stat-record-tooltip-time">${formatTime(entry.time)}</span>
                <div class="stat-record-tooltip-items">${itemLabels}</div>
            </div>
        `;
    }).join('');

    tooltipEl.innerHTML = `
        <div class="stat-record-tooltip-title">${t('stats_best_evening_tooltip_title')}</div>
        <div class="stat-record-tooltip-list">${rows}</div>
    `;
}

function parseLocalDate(dateValue) {
    if (!dateValue) return null;
    const parts = dateValue.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return null;
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatLocalDate(dateValue) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTodayLocalDateString() {
    return formatLocalDate(new Date());
}

function clampStatsDateInputs() {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    if (!startDateInput || !endDateInput) return { startDate: '', endDate: '' };

    const today = getTodayLocalDateString();
    let startDate = startDateInput.value || '';
    let endDate = endDateInput.value || '';

    if (endDate && endDate > today) {
        endDate = today;
        endDateInput.value = endDate;
    }

    if (startDate && endDate && startDate > endDate) {
        startDate = endDate;
        startDateInput.value = startDate;
    }

    return { startDate, endDate };
}

function updateTotalTimelineTitle(startDate, endDate) {
    const title = document.getElementById('total-timeline-title');
    if (!title) return;

    if (startDate && endDate) {
        const parsedEndDate = parseLocalDate(endDate);
        const today = parseLocalDate(formatLocalDate(new Date()));
        const boundedEndDate = parsedEndDate && today && parsedEndDate > today
            ? formatLocalDate(today)
            : endDate;

        title.textContent = t('total_timeline_with_period', {
            start: formatSelectedDate(startDate),
            end: formatSelectedDate(boundedEndDate)
        });
        return;
    }

    title.textContent = t('total_timeline');
}

// Fonction pour formater l'heure en format court (14h56)
function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    return `${hours}h${minutes}`;
}

function formatClockTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
}

// Rend la carte alcoolémie et arme le rafraîchissement live (l'estimation décroît).
function renderBac(estimate) {
    const section = document.getElementById('bac-section');
    const missing = document.getElementById('bac-profile-missing');
    const content = document.getElementById('bac-content');
    if (!section || !missing || !content) return;

    stopBacTick();

    const subtitle = document.getElementById('bac-subtitle');
    const gauge = document.getElementById('bac-gauge');
    const legalInfo = document.getElementById('bac-legal-info');
    const probation = section.querySelector('.bac-probation');
    const disclaimer = section.querySelector('[data-i18n="bac_disclaimer"]');

    // Aucune donnée, ou journée sans consommation : on masque la carte.
    if (!estimate || estimate.has_drinks === false) {
        bacAnchor = null;
        destroyBacChart();
        section.style.display = 'none';
        if (subtitle) subtitle.style.display = 'none';
        return;
    }

    // Profil incomplet : on invite à le renseigner (seulement si une journée a des prises).
    if (estimate.available === false) {
        bacAnchor = null;
        destroyBacChart();
        section.style.display = 'block';
        if (subtitle) subtitle.style.display = 'none';
        missing.style.display = 'block';
        content.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    missing.style.display = 'none';
    content.style.display = 'block';

    updateBacChart(estimate);

    const isSummary = estimate.is_summary === true;

    // Sous-titre : « aujourd'hui » en direct, ou la date pour une journée passée.
    if (subtitle) {
        subtitle.style.display = 'block';
        subtitle.textContent = isSummary
            ? t('bac_subtitle_day', { date: formatSelectedDate(estimate.selected_date) })
            : t('bac_subtitle_today');
    }

    // Journée passée : résumé graphique uniquement. On retire le taux courant, les
    // projections de retour (0 g/L / seuil légal) et la mention permis probatoire.
    if (isSummary) {
        bacAnchor = null;
        if (gauge) gauge.style.display = 'none';
        if (legalInfo) legalInfo.style.display = 'none';
        if (probation) probation.style.display = 'none';
        // Journée passée : disclaimer sans « ne prenez pas le volant » (pas de conduite en jeu).
        if (disclaimer) disclaimer.textContent = t('bac_disclaimer_summary');
        return;
    }

    // Soirée en cours : affichage complet et suivi en direct.
    if (gauge) gauge.style.display = '';
    if (legalInfo) legalInfo.style.display = '';
    if (probation) probation.style.display = '';
    if (disclaimer) disclaimer.textContent = t('bac_disclaimer');

    const legalLimit = Number(estimate.legal_limit);
    bacAnchor = {
        bac: Number(estimate.bac) || 0,
        atMs: Date.now(),
        legalLimit: Number.isFinite(legalLimit) ? legalLimit : bacLegalLimit,
        soberLegalAt: estimate.sober_legal_at || null,
        soberAt: estimate.sober_at || null,
        // Courbe modélisée (temps local -> taux) : le nombre en direct s'y réfère pour
        // suivre la montée pendant l'absorption, comme le graphe (et non une simple descente).
        curve: (Array.isArray(estimate.curve) ? estimate.curve : [])
            .map(p => ({ ms: new Date(p.t).getTime(), bac: Number(p.bac) || 0 }))
    };

    updateBacDisplay();
    bacTickTimer = setInterval(updateBacDisplay, 30000);
}

function stopBacTick() {
    if (bacTickTimer) {
        clearInterval(bacTickTimer);
        bacTickTimer = null;
    }
}

function destroyBacChart() {
    if (bacChart) {
        bacChart.destroy();
        bacChart = null;
    }
    bacChartNowIndex = -1;
    const wrap = document.getElementById('bac-chart-wrap');
    if (wrap) wrap.style.display = 'none';
}

// Interpole le taux d'alcoolemie sur la courbe modelisee (points {ms, bac}) a l'instant ms.
function bacFromCurve(curve, ms) {
    if (!curve || curve.length === 0) return 0;
    if (ms <= curve[0].ms) return curve[0].bac;
    if (ms >= curve[curve.length - 1].ms) return 0;  // apres le retour a 0
    for (let i = 1; i < curve.length; i++) {
        if (ms <= curve[i].ms) {
            const a = curve[i - 1];
            const b = curve[i];
            const span = b.ms - a.ms;
            const frac = span > 0 ? (ms - a.ms) / span : 0;
            return Math.max(0, a.bac + frac * (b.bac - a.bac));
        }
    }
    return 0;
}

// Trace la courbe modelisee du taux d'alcoolemie (debut de soiree -> retour a 0).
function updateBacChart(estimate) {
    const wrap = document.getElementById('bac-chart-wrap');
    const canvas = document.getElementById('bacChart');
    const curve = estimate && Array.isArray(estimate.curve) ? estimate.curve : [];

    if (typeof Chart === 'undefined' || !wrap || !canvas || curve.length < 2) {
        destroyBacChart();
        return;
    }

    const theme = getChartThemeColors();
    const lineColor = getCssColor('--secondary-color', '#3498db');
    const limitColor = getCssColor('--accent-color', '#e74c3c');
    const nowColor = getCssColor('--warning-color', '#f39c12');

    const points = curve.map(p => ({ x: new Date(p.t).getTime(), y: p.bac }));
    const minX = points[0].x;
    const maxX = points[points.length - 1].x;
    const legalLimit = Number(estimate.legal_limit);
    const nowMs = estimate.now ? new Date(estimate.now).getTime() : null;
    const currentBac = Number(estimate.bac) || 0;

    const datasets = [{
        label: t('bac_chart_series'),
        data: points,
        borderColor: lineColor,
        backgroundColor: colorWithAlpha(lineColor, 0.15),
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        // Segments droits : le modèle est linéaire par morceaux, et le point
        // « Maintenant » (interpolation linéaire) doit tomber exactement sur la courbe.
        tension: 0,
        order: 3
    }];

    if (Number.isFinite(legalLimit) && legalLimit > 0) {
        datasets.push({
            label: t('bac_chart_legal'),
            data: [{ x: minX, y: legalLimit }, { x: maxX, y: legalLimit }],
            borderColor: limitColor,
            borderWidth: 1.5,
            borderDash: [6, 6],
            pointRadius: 0,
            fill: false,
            order: 2
        });
    }

    bacChartNowIndex = -1;
    if (nowMs != null && nowMs >= minX && nowMs <= maxX) {
        datasets.push({
            label: t('bac_chart_now'),
            data: [{ x: nowMs, y: currentBac }],
            borderColor: nowColor,
            backgroundColor: nowColor,
            pointRadius: 5,
            pointHoverRadius: 6,
            showLine: false,
            order: 1
        });
        bacChartNowIndex = datasets.length - 1;
    }

    wrap.style.display = 'block';

    if (bacChart) {
        bacChart.destroy();
    }

    bacChart = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'nearest' },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: theme.textColor,
                        usePointStyle: true,
                        padding: 14,
                        // Le seuil légal (dataset en pointillés) est représenté dans la légende
                        // par des tirets, comme sa ligne sur le graphe, plutôt que par un rond.
                        generateLabels: chart => Chart.defaults.plugins.legend.labels
                            .generateLabels(chart)
                            .map(item => {
                                const dataset = chart.data.datasets[item.datasetIndex];
                                if (dataset && Array.isArray(dataset.borderDash) && dataset.borderDash.length) {
                                    item.pointStyle = 'line';
                                    item.lineWidth = dataset.borderWidth || 2;
                                    item.lineDash = dataset.borderDash;
                                }
                                return item;
                            })
                    }
                },
                tooltip: {
                    backgroundColor: colorWithAlpha(theme.textColor, 0.92),
                    titleColor: getCssColor('--card-bg', '#ffffff'),
                    bodyColor: getCssColor('--card-bg', '#ffffff'),
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: items => formatTime(new Date(items[0].parsed.x).toTimeString().slice(0, 8)),
                        label: ctx => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} g/L`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: theme.gridColor },
                    ticks: {
                        color: theme.textColor,
                        padding: 6,
                        callback: value => value + ' g/L'
                    }
                },
                x: {
                    type: 'linear',
                    grid: { display: false },
                    ticks: {
                        color: theme.textColor,
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 7,
                        padding: 6,
                        callback: value => new Date(value).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
                    }
                }
            }
        }
    });
}

// Calcule le taux courant à partir de l'ancre serveur (décroissance continue).
function updateBacDisplay() {
    if (!bacAnchor) return;
    const valueEl = document.getElementById('bac-value');
    const verdictEl = document.getElementById('bac-verdict');
    const gaugeEl = document.getElementById('bac-gauge');
    const legalEl = document.getElementById('bac-legal-info');
    if (!valueEl || !verdictEl || !gaugeEl || !legalEl) return;

    const limit = bacAnchor.legalLimit;
    const limitText = formatBacLimit(limit);
    const nowMs = Date.now();
    let bac;
    if (bacAnchor.curve && bacAnchor.curve.length >= 2) {
        // On lit la courbe modélisée : montée pendant l'absorption puis descente.
        bac = bacFromCurve(bacAnchor.curve, nowMs);
    } else {
        // Repli : décroissance linéaire depuis la dernière valeur serveur.
        const elapsedHours = (nowMs - bacAnchor.atMs) / 3600000;
        bac = Math.max(0, bacAnchor.bac - bacEliminationRatePerHour * elapsedHours);
    }
    const canDrive = bac < limit;

    valueEl.textContent = bac.toFixed(2);

    // Garde le point « Maintenant » du graphe aligné sur le nombre en direct.
    if (bacChart && bacChartNowIndex >= 0 && bacChart.data.datasets[bacChartNowIndex]) {
        bacChart.data.datasets[bacChartNowIndex].data = [{ x: nowMs, y: bac }];
        bacChart.update('none');
    }

    // Niveau : rouge au-dessus du seuil, jaune dans les 40 % sous le seuil, vert sinon.
    let level;
    if (bac >= limit) {
        // Au-dessus du seuil (ou tout taux positif si le seuil vaut 0).
        level = 'danger';
    } else if (limit > 0 && bac >= limit * 0.6) {
        level = 'warn';
    } else {
        level = 'ok';
    }

    gaugeEl.classList.remove('bac-level-ok', 'bac-level-warn', 'bac-level-danger');
    gaugeEl.classList.add('bac-level-' + level);

    verdictEl.classList.remove('bac-verdict-ok', 'bac-verdict-warn', 'bac-verdict-no');
    if (level === 'danger') {
        verdictEl.textContent = t('bac_verdict_no');
        verdictEl.classList.add('bac-verdict-no');
    } else if (level === 'warn') {
        verdictEl.textContent = t('bac_verdict_warn', { limit: limitText });
        verdictEl.classList.add('bac-verdict-warn');
    } else {
        verdictEl.textContent = t('bac_verdict_ok', { limit: limitText });
        verdictEl.classList.add('bac-verdict-ok');
    }

    legalEl.classList.remove('bac-legal-info--wait', 'bac-legal-info--clear');
    let legalLead = null;
    let legalTargetIso = null;
    if (!canDrive && bacAnchor.soberLegalAt) {
        legalLead = t('bac_legal_until_label', { limit: limitText });
        legalTargetIso = bacAnchor.soberLegalAt;
        legalEl.classList.add('bac-legal-info--wait');
    } else if (canDrive && bac > 0 && bacAnchor.soberAt) {
        legalLead = t('bac_sober_label');
        legalTargetIso = bacAnchor.soberAt;
        legalEl.classList.add('bac-legal-info--clear');
    }

    if (legalLead && legalTargetIso) {
        const clock = formatClockTime(legalTargetIso);
        const etaMs = new Date(legalTargetIso).getTime() - Date.now();
        legalEl.innerHTML =
            '<span class="bac-legal-body">'
            + `<span class="bac-legal-lead">${legalLead}</span>`
            + `<span class="bac-legal-time">${t('bac_clock_at', { time: clock })}</span>`
            + `<span class="bac-legal-eta">${formatBacEta(etaMs)}</span>`
            + '</span>';
    } else {
        legalEl.innerHTML = '';
    }
}

// Délai restant formaté (ex. "dans ~1 h 40"), mis à jour à chaque tick.
function formatBacEta(ms) {
    const totalMinutes = Math.max(1, Math.round(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    let duration;
    if (hours > 0 && minutes > 0) {
        duration = t('duration_hm', { h: hours, m: minutes });
    } else if (hours > 0) {
        duration = t('duration_h', { h: hours });
    } else {
        duration = t('duration_m', { m: minutes });
    }
    return t('bac_eta', { duration: duration });
}

// Affiche le seuil légal dans la locale courante (ex. "0,5" en FR, "0.5" en EN).
function formatBacLimit(limit) {
    const value = Number(limit);
    if (!Number.isFinite(value)) return '';
    return value.toLocaleString(currentLocale(), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2
    });
}

function updateStatsDisplay(data) {
    lastStatsData = data;
    const totalPintsEl = document.getElementById('total-pints');
    const totalHalfEl = document.getElementById('total-half');
    const total33El = document.getElementById('total-33');
    const totalLitersEl = document.getElementById('total-liters');
    
    if (totalPintsEl) totalPintsEl.innerText = data.total_pints;
    if (totalHalfEl) totalHalfEl.innerText = data.total_half_pints;
    if (total33El) total33El.innerText = data.total_33cl;
    if (totalLitersEl) totalLitersEl.innerText = data.total_liters;
    
    lastRecordEvening = data.record_evening || null;
    updateEstimatedCost(data.total_liters);
    updateBestEveningDisplay(data.best_evening);
    updateFirstConsumptionDisplay(data.first_consumption_date);
    updateConsumptionRateStats(data.consumption_rate_stats);

    const warningsContainer = document.getElementById('warnings-container');
    const warningsList = document.getElementById('warnings-list');
    
    if (warningsContainer && warningsList) {
        const now = new Date();

        // Séparer les avertissements hebdomadaires, record, eau et 3h
        const weeklyWarnings = data.warnings.filter(w => w.type === 'weekly');
        const recordWarnings = data.warnings.filter(w => w.type === 'record');
        const waterAck = getWaterReminderAck();
        const waterWarnings = data.warnings.filter(w => {
            if (w.type !== 'water') return false;
            // Disparaît automatiquement 2h après la dernière bière (échéance fournie par le serveur).
            if (w.expires_at && new Date(w.expires_at) <= now) return false;
            // Nouvelle soirée (ou jamais validé) : le serveur garantit déjà total >= seuil.
            if (waterAck.key !== w.start_date) return true;
            // Sinon, réafficher seulement après un seuil complet bu depuis la validation.
            const threshold = Number(w.threshold_liters) || waterReminderThresholdLiters;
            return (Number(w.total_liters) - waterAck.total) >= threshold - 1e-9;
        });
        const failedLoginWarnings = data.warnings.filter(w => {
            if (w.type !== 'failed_login') return false;
            // Vérifier si l'alerte a été dismissée récemment (dernières 24h)
            try {
                const dismissed = localStorage.getItem('failed_login_dismissed');
                if (dismissed) {
                    const dismissedTime = parseInt(dismissed);
                    const hoursSinceDismiss = (Date.now() - dismissedTime) / (1000 * 60 * 60);
                    // Ne pas réafficher si dismissée il y a moins de 24h
                    if (hoursSinceDismiss < 24) return false;
                }
            } catch (error) {
                // Stockage indisponible, afficher l'alerte
            }
            return true;
        });
        const threeHourWarnings = data.warnings.filter(
            w => w.type !== 'weekly' && w.type !== 'record' && w.type !== 'water' && w.type !== 'failed_login'
        );

        // Filtrer les avertissements 3h expirés
        const activeThreeHourWarnings = threeHourWarnings.filter(warning => {
            const endDateTime = new Date(warning.end_date + 'T' + warning.end_time);
            return now <= endDateTime;
        });

        // Combiner tous les avertissements actifs
        const allWarnings = [...recordWarnings, ...weeklyWarnings, ...waterWarnings, ...failedLoginWarnings, ...activeThreeHourWarnings];
        
        if (allWarnings.length > 0) {
            warningsContainer.style.display = 'block';
            warningsList.innerHTML = '';
            
            allWarnings.forEach(warning => {
                const warningDiv = document.createElement('div');
                warningDiv.style.cssText = `
                    background-color: var(--card-bg);
                    color: var(--text-color);
                    padding: 1rem;
                    margin-bottom: 1rem;
                    border-left: 4px solid #f39c12;
                    border-radius: 4px;
                    border: 1px solid var(--card-border-color);
                `;
                
                if (warning.type === 'record') {
                    // Nouveau record de soirée battu
                    warningDiv.style.borderLeftColor = '#f1c40f';
                    warningDiv.innerHTML = `
                        <strong style="font-size: 1.1rem;">${t('alert_record_evening_title')}</strong><br>
                        ${t('alert_total')}: <strong>${warning.total_liters}L</strong>
                        (${t('alert_record_evening_previous', {
                            previous: Number(warning.previous_record_liters).toFixed(2),
                            date: formatSelectedDate(warning.previous_record_date)
                        })})
                    `;
                } else if (warning.type === 'water') {
                    // Rappel de boire un verre d'eau
                    warningDiv.style.borderLeftColor = '#3498db';
                    warningDiv.style.position = 'relative';
                    warningDiv.style.paddingRight = '2.5rem';
                    warningDiv.innerHTML = `
                        <strong style="font-size: 1.1rem;">${t('alert_water_reminder_title', {
                            threshold: Number(warning.threshold_liters || waterReminderThresholdLiters).toFixed(2)
                        })}</strong>
                    `;
                    const dismissBtn = document.createElement('button');
                    dismissBtn.type = 'button';
                    dismissBtn.className = 'warning-dismiss warning-confirm';
                    dismissBtn.setAttribute('aria-label', t('alert_water_done'));
                    dismissBtn.setAttribute('title', t('alert_water_done'));
                    dismissBtn.innerText = '✓';
                    const hideWaterWarning = function() {
                        warningDiv.remove();
                        if (!warningsList.children.length) {
                            warningsContainer.style.display = 'none';
                        }
                    };
                    dismissBtn.addEventListener('click', function() {
                        acknowledgeWaterReminder(warning.start_date, warning.total_liters);
                        hideWaterWarning();
                    });
                    warningDiv.appendChild(dismissBtn);
                    // Disparition automatique 2h après la dernière bière, sans rechargement.
                    if (warning.expires_at) {
                        const msLeft = new Date(warning.expires_at).getTime() - Date.now();
                        if (msLeft > 0) {
                            setTimeout(hideWaterWarning, msLeft);
                        }
                    }
                } else if (warning.type === 'failed_login') {
                    // Alerte tentatives de connexion échouées
                    warningDiv.style.borderLeftColor = '#e74c3c';
                    warningDiv.style.position = 'relative';
                    warningDiv.style.paddingRight = '2.5rem';
                    warningDiv.innerHTML = `
                        <strong style="font-size: 1.1rem;">${t('alert_failed_login_title')}</strong><br>
                        ${t('alert_failed_login_message', {
                            count: warning.failed_count,
                            hours: warning.hours
                        })}
                    `;
                    const dismissBtn = document.createElement('button');
                    dismissBtn.type = 'button';
                    dismissBtn.className = 'warning-dismiss';
                    dismissBtn.setAttribute('aria-label', t('alert_dismiss'));
                    dismissBtn.setAttribute('title', t('alert_dismiss'));
                    dismissBtn.innerText = '×';
                    const hideFailedLoginWarning = function() {
                        warningDiv.remove();
                        if (!warningsList.children.length) {
                            warningsContainer.style.display = 'none';
                        }
                    };
                    dismissBtn.addEventListener('click', function() {
                        // Stocker le dismiss dans localStorage
                        try {
                            localStorage.setItem('failed_login_dismissed', Date.now().toString());
                        } catch (error) {
                            // Stockage indisponible
                        }
                        hideFailedLoginWarning();
                    });
                    warningDiv.appendChild(dismissBtn);
                } else if (warning.type === 'weekly') {
                    // Avertissement 3ème jour
                    const dayIndexes = warning.day_indexes || [];
                    const localizedDays = dayIndexes.map(dayIndex => t(`day_${dayIndex}`));
                    const weeklyMessage = (localizedDays.length > 0 || warning.num_days)
                        ? t('days_of_drinking', {
                            count: warning.num_days || localizedDays.length,
                            days: localizedDays.join(', ')
                        })
                        : (warning.message || '');
                    warningDiv.innerHTML = `<strong style="font-size: 1.1rem;">${weeklyMessage}</strong>`;
                } else {
                    warningDiv.innerHTML = `
                        <strong>${t('alert_three_hour_title', {
                            threshold: Number(warning.threshold_liters || threeHourThresholdLiters).toFixed(2)
                        })}</strong><br>
                        ${t('alert_total')}: <strong>${warning.total_liters}L</strong>
                    `;
                }
                
                warningsList.appendChild(warningDiv);
            });
        } else {
            warningsContainer.style.display = 'none';
        }
    }
}

function updateFirstConsumptionDisplay(firstDate) {
    const el = document.getElementById('stats-since');
    if (!el) return;

    if (!firstDate) {
        el.hidden = true;
        el.textContent = '';
        return;
    }

    el.hidden = false;
    el.textContent = t('stats_first_consumption', { date: formatSelectedDate(firstDate) });
}

function updateConsumptionRateStats(rateStats) {
    const beersPerWeekEl = document.getElementById('beers-per-week');
    const beersPerMonthEl = document.getElementById('beers-per-month');
    const beersPerYearEl = document.getElementById('beers-per-year');

    if (!rateStats || !beersPerWeekEl || !beersPerMonthEl || !beersPerYearEl) return;

    beersPerWeekEl.innerText = rateStats.beers_per_week || 0;
    beersPerMonthEl.innerText = rateStats.beers_per_month || 0;
    beersPerYearEl.innerText = rateStats.beers_per_year || 0;
}

function updateBestEveningDisplay(bestEvening) {
    renderBestEveningTooltip(bestEvening);

    const valueEl = document.getElementById('best-evening-value');
    const dateEl = document.getElementById('best-evening-date');
    const detailsEl = document.getElementById('best-evening-details');

    if (!valueEl || !dateEl || !detailsEl) return;

    if (!bestEvening) {
        valueEl.innerText = '-';
        dateEl.innerText = t('stats_best_evening_empty');
        detailsEl.innerHTML = '';
        renderRecordEveningName(null);
        return;
    }

    renderRecordEveningName(bestEvening);

    valueEl.innerText = `${bestEvening.total_liters}L`;
    dateEl.innerText = t('stats_best_evening_on_date', {
        date: formatSelectedDate(bestEvening.date)
    });

    const details = [
        `<span class="stat-record-chip">🍺 ${bestEvening.total_pints} ${t('pints')}</span>`,
        `<span class="stat-record-chip">🍻 ${bestEvening.total_half_pints} ${t('halves')}</span>`,
        `<span class="stat-record-chip">🥃 ${bestEvening.total_33cl} 33 cL</span>`
    ];

    if (bestEvening.first_time && bestEvening.last_time) {
        details.push(
            `<span class="stat-record-chip">🕒 ${formatRecordTimeRange(bestEvening.first_time, bestEvening.last_time)}</span>`
        );
    }

    // Pic d'alcoolémie de la soirée (si le profil poids/sexe est renseigné).
    if (bestEvening.peak_bac != null) {
        details.push(
            `<span class="stat-record-chip">🩸 ${t('record_peak_bac', { bac: Number(bestEvening.peak_bac).toFixed(2) })}</span>`
        );
    }

    detailsEl.innerHTML = details.join('');
}

// La soirée affichée est-elle le record absolu (celui que l'on peut nommer) ?
function isDisplayedEveningTheRecord(bestEvening) {
    return !!(bestEvening && lastRecordEvening && bestEvening.date === lastRecordEvening.date);
}

function renderRecordEveningName(bestEvening) {
    const nameEl = document.getElementById('best-evening-name');
    const valueEl = document.getElementById('best-evening-name-value');
    const btnEl = document.getElementById('best-evening-name-btn');
    if (!nameEl || !valueEl || !btnEl) return;

    // On ne propose le nom que sur la soirée record absolue.
    if (!isDisplayedEveningTheRecord(bestEvening)) {
        nameEl.style.display = 'none';
        valueEl.textContent = '';
        return;
    }

    const name = (lastRecordEvening.name || '').trim();
    nameEl.style.display = 'flex';
    if (name) {
        valueEl.textContent = `🏆 « ${name} »`;
        valueEl.style.display = '';
        btnEl.textContent = t('record_name_edit');
        btnEl.setAttribute('aria-label', t('record_name_edit'));
    } else {
        valueEl.textContent = '';
        valueEl.style.display = 'none';
        btnEl.textContent = t('record_name_add');
        btnEl.setAttribute('aria-label', t('record_name_add'));
    }
}

function openRecordNameModal() {
    const modal = document.getElementById('record-name-modal');
    const input = document.getElementById('record-name-input');
    const clearBtn = document.getElementById('record-name-clear');
    if (!modal || !input) return;

    const currentName = (lastRecordEvening && lastRecordEvening.name) ? lastRecordEvening.name : '';
    input.value = currentName;
    if (clearBtn) clearBtn.style.display = currentName ? '' : 'none';

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => input.focus(), 50);
}

function closeRecordNameModal() {
    const modal = document.getElementById('record-name-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function saveRecordName(name) {
    fetch('/api/record-evening-name', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ name: name })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Record name update failed');
        }
        return response.json();
    })
    .then(data => {
        if (data && data.record_evening) {
            lastRecordEvening = data.record_evening;
        }
        closeRecordNameModal();
        loadStats();
    })
    .catch(error => {
        console.error('Record name error:', error);
        alert(t('error_generic_update'));
    });
}

function initRecordNameModal() {
    const btnEl = document.getElementById('best-evening-name-btn');
    if (btnEl) {
        btnEl.addEventListener('click', function(event) {
            event.stopPropagation();
            openRecordNameModal();
        });
    }

    const closeBtn = document.getElementById('record-name-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeRecordNameModal);

    const saveBtn = document.getElementById('record-name-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            const input = document.getElementById('record-name-input');
            saveRecordName(input ? input.value : '');
        });
    }

    const clearBtn = document.getElementById('record-name-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            saveRecordName('');
        });
    }

    const input = document.getElementById('record-name-input');
    if (input) {
        input.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveRecordName(input.value);
            }
        });
    }

    const modal = document.getElementById('record-name-modal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) closeRecordNameModal();
        });
    }
}

function updateEstimatedCost(totalLiters) {
    const totalCostEl = document.getElementById('total-cost');
    if (!totalCostEl) return;

    const averageBeerPrice = getAverageBeerPrice();
    const totalCost = ((Number(totalLiters) || 0) / averageBeerVolumeLiters * averageBeerPrice).toFixed(2);
    totalCostEl.innerText = totalCost;
}

function updateCharts(data) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        return;
    }
    updateMonthlyChart(data.monthly_chart_stats || data.monthly_stats);
    updateTotalChart(
        data.records,
        data.all_user_records || [],
        data.all_users || [],
        data.current_username || ''
    );
    updateWeeklyChart(data.weekly_stats); 
}

function updateMonthlyChart(monthlyStats) {
    const chartTheme = getChartThemeColors();
    const pintColor = getCssColor('--success-color', '#27ae60');
    const halfColor = getCssColor('--warning-color', '#f39c12');
    const thirtyThreeColor = getCssColor('--stat-purple-color', '#8e44ad');
    const ctx = document.getElementById('monthlyChart');
    if (!ctx) {
        console.warn('Element monthlyChart non trouvé');
        return;
    }
    
    const months = Object.keys(monthlyStats).sort();
    const pintData = months.map(m => monthlyStats[m].pints || 0);
    const halfData = months.map(m => monthlyStats[m].half_pints || 0);
    const thirtyThreeData = months.map(m => monthlyStats[m]['33cl'] || 0);
    
    if (monthlyChart) {
        monthlyChart.destroy();
    }
    
    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => {
                const date = new Date(m + '-01');
                return date.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
            }),
            datasets: [
                {
                    label: t('pints'),
                    data: pintData,
                    backgroundColor: colorWithAlpha(pintColor, 0.74),
                    borderColor: pintColor,
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 34
                },
                {
                    label: t('halves'),
                    data: halfData,
                    backgroundColor: colorWithAlpha(halfColor, 0.74),
                    borderColor: halfColor,
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 34
                },
                {
                    label: '33cl',
                    data: thirtyThreeData,
                    backgroundColor: colorWithAlpha(thirtyThreeColor, 0.74),
                    borderColor: thirtyThreeColor,
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 34
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: chartTheme.textColor,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: colorWithAlpha(chartTheme.textColor, 0.92),
                    titleColor: getCssColor('--card-bg', '#ffffff'),
                    bodyColor: getCssColor('--card-bg', '#ffffff'),
                    displayColors: true,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: {
                        display: false
                    },
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        stepSize: 1,
                        color: chartTheme.textColor,
                        padding: 8
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: chartTheme.textColor,
                        maxRotation: 0,
                        padding: 8
                    }
                }
            }
        }
    });
}

function getTimelinePalette() {
    return [
        getCssColor('--success-color', '#27ae60'),
        getCssColor('--warning-color', '#f39c12'),
        getCssColor('--stat-purple-color', '#8e44ad'),
        '#3498db',
        '#e74c3c',
        '#16a085',
        '#d35400',
        '#2ecc71'
    ];
}

function buildCumulativeSeries(records, dates) {
    const dailyLitersMap = {};
    records.forEach(record => {
        const key = record.date;
        const liters = ((record.pints || 0) * 0.5) + ((record.half_pints || 0) * 0.25) + ((record.liters_33 || 0) * 0.33);
        dailyLitersMap[key] = (dailyLitersMap[key] || 0) + liters;
    });

    let cumulativeLiters = 0;
    return dates.map(dateValue => {
        cumulativeLiters += dailyLitersMap[dateValue] || 0;
        return parseFloat(cumulativeLiters.toFixed(2));
    });
}

function getTimelineDates(personalRecords, allUserRecords) {
    const referenceRecords = showAllUsersTimeline ? allUserRecords : personalRecords;
    const recordDates = [...new Set(referenceRecords.map(record => record.date))].sort((a, b) => new Date(a) - new Date(b));
    const startDateInput = document.getElementById('start-date')?.value;
    const endDateInput = document.getElementById('end-date')?.value;
    const requestedStartDate = parseLocalDate(startDateInput || recordDates[0]);
    const firstConsumptionDate = parseLocalDate(recordDates[0]);
    const startDate = requestedStartDate && firstConsumptionDate && requestedStartDate < firstConsumptionDate
        ? firstConsumptionDate
        : requestedStartDate;
    const requestedEndDate = parseLocalDate(endDateInput || recordDates[recordDates.length - 1]);
    const today = parseLocalDate(formatLocalDate(new Date()));
    const endDate = requestedEndDate && requestedEndDate > today ? today : requestedEndDate;
    const dates = [];

    if (startDate && endDate && startDate <= endDate) {
        const cursor = new Date(startDate);
        while (cursor <= endDate) {
            dates.push(formatLocalDate(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
    }

    return dates;
}

function buildTimelineDatasets(records, allUserRecords, allUsers, currentUsername) {
    const dates = getTimelineDates(records, allUserRecords);
    if (!dates.length) {
        return {
            labels: [],
            shortLabels: [],
            datasets: []
        };
    }

    const labels = dates.map(dateValue => parseLocalDate(dateValue).toLocaleDateString(currentLocale()));
    const shortLabels = dates.map(dateValue => parseLocalDate(dateValue).toLocaleDateString(currentLocale(), {
        day: '2-digit',
        month: '2-digit'
    }));

    if (!showAllUsersTimeline) {
        const totalColor = getCssColor('--success-color', '#27ae60');
        return {
            labels,
            shortLabels,
            datasets: [
                {
                    label: t('chart_cumulative_label'),
                    data: buildCumulativeSeries(records, dates),
                    borderColor: totalColor,
                    backgroundColor: colorWithAlpha(totalColor, 0.12),
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 12,
                    pointBackgroundColor: getCssColor('--card-bg', '#ffffff'),
                    pointBorderColor: totalColor,
                    pointBorderWidth: 2
                }
            ]
        };
    }

    const palette = getTimelinePalette();
    const recordsByUser = new Map();
    (allUsers || []).forEach(user => {
        recordsByUser.set(user.username, []);
    });
    allUserRecords.forEach(record => {
        if (!recordsByUser.has(record.username)) {
            recordsByUser.set(record.username, []);
        }
        recordsByUser.get(record.username).push(record);
    });

    const sortedUsers = Array.from(recordsByUser.keys()).sort((left, right) => {
        if (left === currentUsername) return -1;
        if (right === currentUsername) return 1;
        return left.localeCompare(right, currentLocale());
    });

    const datasets = sortedUsers.map((username, index) => {
        const color = palette[index % palette.length];
        const isCurrentUser = username === currentUsername;
        return {
            label: username,
            data: buildCumulativeSeries(recordsByUser.get(username) || [], dates),
            borderColor: color,
            backgroundColor: colorWithAlpha(color, isCurrentUser ? 0.14 : 0.08),
            borderWidth: isCurrentUser ? 3 : 2,
            fill: false,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHitRadius: 12
        };
    });

    return { labels, shortLabels, datasets };
}

function updateTotalChart(records, allUserRecords = [], allUsers = [], currentUsername = '') {
    const chartTheme = getChartThemeColors();
    const ctx = document.getElementById('totalChart');
    if (!ctx) {
        console.warn('Element totalChart not found');
        return;
    }
    const timelineData = buildTimelineDatasets(records, allUserRecords, allUsers, currentUsername);
    
    if (totalChart) {
        totalChart.destroy();
    }

    totalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timelineData.labels,
            datasets: timelineData.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: chartTheme.textColor,
                        usePointStyle: true,
                        pointStyle: 'line',
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: colorWithAlpha(chartTheme.textColor, 0.92),
                    titleColor: getCssColor('--card-bg', '#ffffff'),
                    bodyColor: getCssColor('--card-bg', '#ffffff'),
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0]?.label || '';
                        },
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y} ${t('chart_unit_liters')}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: {
                        display: false
                    },
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor,
                        padding: 8,
                        callback: function(value) {
                            return value + ' ' + t('chart_unit_liters');
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: chartTheme.textColor,
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8,
                        callback: function(value, index) {
                            return timelineData.shortLabels[index] || this.getLabelForValue(value);
                        },
                        padding: 8
                    }
                }
            }
        }
    });
}

function updateWeeklyChart(weeklyStats) {
    const chartTheme = getChartThemeColors();
    const weeklyColor = getCssColor('--secondary-color', '#3498db');
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) {
        console.warn('Element weeklyChart not found');
        return;
    }
    
    const labels = weeklyStats.map(w => {
        if (!w.week_start) return '';
        const date = new Date(w.week_start);
        const formatted = date.toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit' });
        return `${t('week_of')} ${formatted}`;
    });
    const litersData = weeklyStats.map(w => w.total_liters);
    
    if (weeklyChart) {
        weeklyChart.destroy();
    }
    
    weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: t('chart_weekly_dataset'),
                data: litersData,
                backgroundColor: colorWithAlpha(weeklyColor, 0.74),
                borderColor: weeklyColor,
                borderWidth: 1,
                borderRadius: 8,
                borderSkipped: false,
                maxBarThickness: 46
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: false
                },
                tooltip: {
                    backgroundColor: colorWithAlpha(chartTheme.textColor, 0.92),
                    titleColor: getCssColor('--card-bg', '#ffffff'),
                    bodyColor: getCssColor('--card-bg', '#ffffff'),
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + ' ' + t('chart_unit_liters');
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: {
                        display: false
                    },
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor,
                        padding: 8,
                        callback: function(value) {
                            return value + ' ' + t('chart_unit_liters');
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: chartTheme.textColor,
                        padding: 8
                    }
                }
            }
        }
    });
}

function updateStats() {
    loadStats();
}

function setStatsPeriod(period) {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    if (!startDateInput || !endDateInput) return;

    const today = new Date();
    const todayDate = parseLocalDate(getTodayLocalDateString());
    let startDate = null;
    let endDate = null;

    if (period === 'current-month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = todayDate;
    } else if (period === 'current-year') {
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = todayDate;
    }

    if (!startDate || !endDate) return;

    startDateInput.value = formatLocalDate(startDate);
    endDateInput.value = formatLocalDate(endDate);
    loadStats();
}

function updateStatsShortcutLabels() {
    const monthShortcut = document.getElementById('current-month-shortcut');
    const yearShortcut = document.getElementById('current-year-shortcut');
    const today = new Date();

    if (monthShortcut) {
        monthShortcut.textContent = today.toLocaleDateString(currentLocale(), {
            month: 'long',
            year: 'numeric'
        });
    }

    if (yearShortcut) {
        yearShortcut.textContent = String(today.getFullYear());
    }
}

function exportData() {
    window.location.href = '/api/export';
}

function exportDashboardPng() {
    const dashboard = document.getElementById('dashboard-content');
    if (!dashboard || typeof html2canvas === 'undefined') {
        alert(t('error_png_export_unavailable'));
        return;
    }

    const startDate = document.getElementById('start-date')?.value || 'start';
    const endDate = document.getElementById('end-date')?.value || 'end';
    const filename = `zytholo-dashboard-${startDate}-${endDate}.png`;
    const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-color')
        .trim() || '#ecf0f1';

    document.body.classList.add('exporting-dashboard');

    requestAnimationFrame(() => {
        html2canvas(dashboard, {
            backgroundColor: bgColor,
            scale: Math.min(window.devicePixelRatio || 1, 2),
            useCORS: true
        })
        .then(canvas => {
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        })
        .catch(error => {
            console.error('PNG export failed:', error);
            alert(t('error_png_export_unavailable'));
        })
        .finally(() => {
            document.body.classList.remove('exporting-dashboard');
        });
    });
}

// Gestion de la modal "Quoi de neuf ?"
const whatsNewVersionKey = 'zytholo_last_seen_version';

function initWhatsNewModal() {
    const modal = document.getElementById('whats-new-modal');
    const openBtn = document.getElementById('whats-new-menu-item');
    const closeBtn = document.getElementById('whats-new-modal-close');
    const okBtn = document.getElementById('whats-new-modal-ok');

    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', function() {
        setUserMenuOpen(false);
        openWhatsNewModal();
    });

    [closeBtn, okBtn].forEach(function(button) {
        if (button) {
            button.addEventListener('click', closeWhatsNewModal);
        }
    });

    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeWhatsNewModal();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeWhatsNewModal();
        }
    });

    // Vérifier si une nouvelle version est disponible
    checkForNewVersion();
}

function openWhatsNewModal() {
    const modal = document.getElementById('whats-new-modal');
    if (!modal) return;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    loadWhatsNewContent();
}

function closeWhatsNewModal() {
    const modal = document.getElementById('whats-new-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    // Marquer comme vu
    markWhatsNewAsSeen();
}

function loadWhatsNewContent() {
    const contentEl = document.getElementById('whats-new-content');
    if (!contentEl) return;

    contentEl.innerHTML = `<p class="whats-new-loading" data-i18n="whats_new_loading">${t('whats_new_loading')}</p>`;

    fetch('/api/whats-new')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.changelog) {
                renderWhatsNewContent(data.changelog, data.current_version);
            } else {
                contentEl.innerHTML = `<p class="whats-new-error">${t('whats_new_error')}</p>`;
            }
        })
        .catch(error => {
            console.error('Error loading whats new:', error);
            contentEl.innerHTML = `<p class="whats-new-error">${t('whats_new_error')}</p>`;
        });
}

function renderWhatsNewContent(changelog, currentVersion) {
    const contentEl = document.getElementById('whats-new-content');
    if (!contentEl) return;

    let html = '';

    if (currentVersion) {
        html += `<div class="whats-new-version">Version ${currentVersion}</div>`;
    }

    // Afficher les 2 premières versions du changelog
    const versions = changelog.slice(0, 2);

    versions.forEach((version, index) => {
        const isLatest = index === 0;
        html += `<div class="whats-new-section${isLatest ? ' whats-new-latest' : ''}">`;
        html += `<h3 class="whats-new-title">${version.version}</h3>`;

        if (version.description) {
            html += `<p class="whats-new-description">${version.description}</p>`;
        }

        if (version.changes && version.changes.length > 0) {
            html += '<ul class="whats-new-list">';
            version.changes.forEach(change => {
                const icon = getChangeIcon(change.type);
                html += `<li class="whats-new-item whats-new-item-${change.type}">`;
                html += `<span class="whats-new-icon">${icon}</span>`;
                html += `<span class="whats-new-text">${escapeHtml(change.text)}</span>`;
                html += '</li>';
            });
            html += '</ul>';
        }

        html += '</div>';
    });

    contentEl.innerHTML = html;
}

function getChangeIcon(type) {
    const icons = {
        'add': '✨',
        'change': '🔄',
        'fix': '🐛',
        'del': '🗑️'
    };
    return icons[type] || '•';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function checkForNewVersion() {
    if (passwordChangeRequired) return;

    fetch('/api/whats-new')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.current_version) {
                const lastSeenVersion = getLastSeenVersion();
                if (!lastSeenVersion || lastSeenVersion !== data.current_version) {
                    // Nouvelle version détectée, afficher la modal automatiquement
                    setTimeout(() => openWhatsNewModal(), 1000);
                }
            }
        })
        .catch(error => {
            console.error('Error checking version:', error);
        });
}

function getLastSeenVersion() {
    try {
        return localStorage.getItem(whatsNewVersionKey);
    } catch (error) {
        return null;
    }
}

function markWhatsNewAsSeen() {
    fetch('/api/whats-new')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.current_version) {
                try {
                    localStorage.setItem(whatsNewVersionKey, data.current_version);
                } catch (error) {
                    console.error('Error saving version:', error);
                }
            }
        })
        .catch(error => {
            console.error('Error marking as seen:', error);
        });
}
