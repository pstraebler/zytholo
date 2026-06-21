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
    liters_33: 0
};

let monthlyChart = null;
let totalChart = null;
let savingInProgress = false;
let nightModeEnabled = false;
let lastClickTime = 0;
let weeklyChart = null;
let userMenuOpen = false;
let passwordModalCloseTimer = null;
let passwordChangeRequired = false;
let lastStatsData = null;
let showAllUsersTimeline = false;

const averageBeerPriceStorageKey = 'zytholo_average_beer_price';
const defaultAverageBeerPrice = 6;
const averageBeerVolumeLiters = 0.5;
const defaultThreeHourThresholdLiters = 1.5;
let threeHourThresholdLiters = defaultThreeHourThresholdLiters;
const defaultWeeklyDrinkingDaysThreshold = 3;
let weeklyDrinkingDaysThreshold = defaultWeeklyDrinkingDaysThreshold;

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
    initTimelineModeToggle();

    document.addEventListener('languageChanged', function() {
        updateSettingsLanguageSelection();
        updateSettingsThemeSelection();
        updateStatsShortcutLabels();
        updateNightModeUI();
        if (!passwordChangeRequired) {
            loadStats();
        }
    });

    document.addEventListener('themeChanged', function() {
        updateSettingsThemeSelection();
        if (!passwordChangeRequired) {
            loadStats();
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

function applySettings(settings) {
    const threshold = parseFloat(settings?.three_hour_threshold_liters);
    if (Number.isFinite(threshold) && threshold > 0) {
        threeHourThresholdLiters = threshold;
    }

    const weeklyThreshold = parseInt(settings?.weekly_drinking_days_threshold, 10);
    if (Number.isInteger(weeklyThreshold) && weeklyThreshold >= 2 && weeklyThreshold <= 7) {
        weeklyDrinkingDaysThreshold = weeklyThreshold;
    }

    updateThreeHourThresholdInput();
    updateWeeklyDaysThresholdInput();
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
    if (!threeHourInput || !weeklyDaysInput) return;

    const threeHourThreshold = parseFloat(threeHourInput.value.replace(',', '.'));
    const weeklyDaysThreshold = parseInt(weeklyDaysInput.value, 10);
    if (
        !Number.isFinite(threeHourThreshold)
        || threeHourThreshold < 0.1
        || threeHourThreshold > 10
        || !Number.isInteger(weeklyDaysThreshold)
        || weeklyDaysThreshold < 2
        || weeklyDaysThreshold > 7
    ) {
        updateThreeHourThresholdInput();
        updateWeeklyDaysThresholdInput();
        return;
    }

    if (
        Math.abs(threeHourThreshold - threeHourThresholdLiters) < 0.001
        && weeklyDaysThreshold === weeklyDrinkingDaysThreshold
    ) {
        updateThreeHourThresholdInput();
        updateWeeklyDaysThresholdInput();
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
            weekly_drinking_days_threshold: weeklyDaysThreshold
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

  // Empêcher la décrémentation en mode soirée
  if (nightModeEnabled && value < 0) {
    showNightModeDecrementNotification();
  return;
  }


  // Vérifier si on est déjà à 0 avant de décrémenter
  if (value < 0 && currentBeer[type] === 0) {
    // Ne rien faire si on essaie de décrémenter une quantité déjà à 0
    return;
  }

  currentBeer[type] = Math.max(0, currentBeer[type] + value);
  document.getElementById(type + '-count').innerText = currentBeer[type];
  saveBeerAutomatic(type, value);
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
    
    fetch(`/api/day-history?date=${selectedDate}`)
        .then(response => response.json())
        .then(data => {
            currentBeer = {
                pints: data.total_pints || 0,
                half_pints: data.total_half_pints || 0,
                liters_33: data.total_33cl || 0
            };

            console.log('Consommation totale du jour logique:', currentBeer);
            
            document.getElementById('pints-count').innerText = currentBeer.pints;
            document.getElementById('half_pints-count').innerText = currentBeer.half_pints;
            document.getElementById('liters_33-count').innerText = currentBeer.liters_33;
            renderDayHistory(data);
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
            quantityBadges.push(`<span class="day-history-badge">🥤 ${record.liters_33}</span>`);
        }

        const nextDayLabel = record.logical_day_offset === 1
            ? `<span class="day-history-offset">${t('day_history_next_day')}</span>`
            : '';

        return `
            <div class="day-history-item">
                <div class="day-history-item-main">
                    <span class="day-history-time">${formatDayHistoryTime(record.time)}</span>
                    ${nextDayLabel}
                    <div class="day-history-badges">${quantityBadges.join('')}</div>
                </div>
                <span class="day-history-liters">${formatDayHistoryLiters(record.total_liters)} L</span>
            </div>
        `;
    }).join('');
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
        liters_33: type === 'liters_33' ? value : 0
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
        'liters_33': '33cl'
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
    notificationDiv.innerText = `${symbol} ${beerLabels[type]} ${value > 0 ? '+' : ''}${value}`;
    
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
    
    const url = `/api/consumption?start_date=${startDate}&end_date=${endDate}`;
    
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
        items.push(`${entry.liters_33} × 33cl`);
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
    
    updateEstimatedCost(data.total_liters);
    updateBestEveningDisplay(data.best_evening);
    
    const warningsContainer = document.getElementById('warnings-container');
    const warningsList = document.getElementById('warnings-list');
    
    if (warningsContainer && warningsList) {
        const now = new Date();
        
        // Séparer les avertissements hebdomadaires et les 3h
        const weeklyWarnings = data.warnings.filter(w => w.type === 'weekly');
        const threeHourWarnings = data.warnings.filter(w => w.type !== 'weekly');
        
        // Filtrer les avertissements 3h expirés
        const activeThreeHourWarnings = threeHourWarnings.filter(warning => {
            const endDateTime = new Date(warning.end_date + 'T' + warning.end_time);
            return now <= endDateTime;
        });
        
        // Combiner tous les avertissements actifs
        const allWarnings = [...weeklyWarnings, ...activeThreeHourWarnings];
        
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
                
                if (warning.type === 'weekly') {
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
        return;
    }

    valueEl.innerText = `${bestEvening.total_liters}L`;
    dateEl.innerText = t('stats_best_evening_on_date', {
        date: formatSelectedDate(bestEvening.date)
    });

    const details = [
        `<span class="stat-record-chip">🍺 ${bestEvening.total_pints} ${t('pints')}</span>`,
        `<span class="stat-record-chip">🍻 ${bestEvening.total_half_pints} ${t('halves')}</span>`,
        `<span class="stat-record-chip">🥤 ${bestEvening.total_33cl} × 33cl</span>`
    ];

    if (bestEvening.first_time && bestEvening.last_time) {
        details.push(
            `<span class="stat-record-chip">🕒 ${formatRecordTimeRange(bestEvening.first_time, bestEvening.last_time)}</span>`
        );
    }

    detailsEl.innerHTML = details.join('');
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
