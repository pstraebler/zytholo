const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const i18n = window.BeerTrackerI18n;

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

function getChartThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
        textColor: styles.getPropertyValue('--chart-text-color').trim() || '#2c3e50',
        gridColor: styles.getPropertyValue('--chart-grid-color').trim() || 'rgba(44, 62, 80, 0.15)'
    };
}

document.addEventListener('DOMContentLoaded', function() {
    passwordChangeRequired = document.body?.dataset.forcePasswordChange === 'true';
    const today = new Date().toISOString().split('T')[0];
    
    const todayInput = document.getElementById('today-date');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    
    if (todayInput) {
        todayInput.value = today;
        todayInput.addEventListener('change', function() {
            loadTodayConsumption();
        });
    }
    
    if (startDateInput && endDateInput) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDateInput.value = startDate.toISOString().split('T')[0];
        endDateInput.value = today;
    }
    
    if (!passwordChangeRequired) {
        refreshDashboardData();
    }
    initUserMenu();
    initPasswordModal();
    initSettingsModal();

    document.addEventListener('languageChanged', function() {
        updateSettingsLanguageSelection();
        updateNightModeUI();
        if (!passwordChangeRequired) {
            loadStats();
        }
    });

    document.addEventListener('themeChanged', function() {
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

    updateSettingsLanguageSelection();
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    updateSettingsLanguageSelection();
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

function toggleNightMode() {
    if (!nightModeEnabled) {
        // Demander confirmation pour activer
        const confirmDiv = document.createElement('div');
        confirmDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        
        confirmDiv.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px;">
                <h2 style="margin-bottom: 1rem; color: #2c3e50;">${t('night_mode_modal_title')}</h2>
                <p style="margin-bottom: 1rem; color: #475569;">
                    ${t('night_mode_modal_intro')}
                </p>
                <ul style="margin-bottom: 1.5rem; margin-left: 1.5rem; color: #475569;">
                    <li>${t('night_mode_modal_item_1')}</li>
                    <li>${t('night_mode_modal_item_2')}</li>
                </ul>
                <p style="margin-bottom: 1.5rem; color: #f39c12; font-weight: bold;">
                    ${t('night_mode_modal_warning')}
                </p>
                <div style="display: flex; gap: 1rem;">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex: 1; padding: 0.75rem; background-color: #bdc3c7; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                        ${t('cancel')}
                    </button>
                    <button onclick="activateNightMode()" style="flex: 1; padding: 0.75rem; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                        ${t('activate')}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(confirmDiv);
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
        document.querySelector('div[style*="rgba(0, 0, 0, 0.7)"]')?.remove();
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
            nightModeBtn.style.backgroundColor = '#e74c3c';
            nightModeBtn.style.color = 'white';
            nightModeBtn.disabled = true;
        } else {
            nightModeBtn.textContent = t('night_mode_activate');
            nightModeBtn.style.backgroundColor = '#3498db';
            nightModeBtn.style.color = 'white';
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
    
    fetch(`/api/consumption?start_date=${selectedDate}&end_date=${selectedDate}`)
        .then(response => response.json())
        .then(data => {
            currentBeer = {
                pints: 0,
                half_pints: 0,
                liters_33: 0
            };
            
            // Agréger TOUS les enregistrements du jour (tous les créneaux)
            if (data.records && data.records.length > 0) {
                data.records.forEach(record => {
                    currentBeer.pints += record.pints || 0;
                    currentBeer.half_pints += record.half_pints || 0;
                    currentBeer.liters_33 += record.liters_33 || 0;
                });
                console.log('Consommation totale du jour:', currentBeer);
            }
            
            document.getElementById('pints-count').innerText = currentBeer.pints;
            document.getElementById('half_pints-count').innerText = currentBeer.half_pints;
            document.getElementById('liters_33-count').innerText = currentBeer.liters_33;
        })
        .catch(error => {
            console.error('Error while loading:', error);
        });
}

// Enregistrer automatiquement avec heure actuelle
function saveBeerAutomatic(type, value) {
    if (savingInProgress) return;
    
    savingInProgress = true;
    
    const date = document.getElementById('today-date').value;
    const now = new Date();
    const time = now.toTimeString().slice(0, 8); // HH:MM:SS
    
    const payload = {
        date: date,
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

function medalLabel(medalIndex) {
    if (medalIndex === 1) return t('medal_gold');
    if (medalIndex === 2) return t('medal_silver');
    return t('medal_bronze');
}

function medalIcon(medalIndex) {
    if (medalIndex === 1) return '🥇';
    if (medalIndex === 2) return '🥈';
    return '🥉';
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
            <div class="trophy-icon">${medalIcon(group.medal_index)}</div>
            <div class="trophy-rank">${medalLabel(group.medal_index)}</div>
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

    const startDate = document.getElementById('start-date')?.value || '';
    const endDate = document.getElementById('end-date')?.value || '';
    updateTotalTimelineTitle(startDate, endDate);
    
    const url = `/api/consumption?start_date=${startDate}&end_date=${endDate}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
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

function updateTotalTimelineTitle(startDate, endDate) {
    const title = document.getElementById('total-timeline-title');
    if (!title) return;

    if (startDate && endDate) {
        title.textContent = t('total_timeline_with_period', {
            start: formatSelectedDate(startDate),
            end: formatSelectedDate(endDate)
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
    const totalPintsEl = document.getElementById('total-pints');
    const totalHalfEl = document.getElementById('total-half');
    const total33El = document.getElementById('total-33');
    const totalLitersEl = document.getElementById('total-liters');
    const totalCostEl = document.getElementById('total-cost');
    
    if (totalPintsEl) totalPintsEl.innerText = data.total_pints;
    if (totalHalfEl) totalHalfEl.innerText = data.total_half_pints;
    if (total33El) total33El.innerText = data.total_33cl;
    if (totalLitersEl) totalLitersEl.innerText = data.total_liters;
    
    if (totalCostEl) {
        const costPerLiter = 12;
        const totalCost = (data.total_liters * costPerLiter).toFixed(2);
        totalCostEl.innerText = totalCost;
    }
    
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
                    background-color: white;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    border-left: 4px solid #f39c12;
                    border-radius: 4px;
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
                    // Avertissement 3h (existant)
                    const items = warning.items.map(item => 
                        `<li style="margin-left: 2rem">${item.time}: ${item.liters}L</li>`
                    ).join('');
                    
                    warningDiv.innerHTML = `
                        <strong>${t('alert_three_hour_title', { time: formatTime(warning.start_time) })}</strong><br>
                        ${t('alert_total')}: <strong>${warning.total_liters}L</strong><br>
                        <ul style="margin-top: 0.5rem; margin-bottom: 0;">
                            ${items}
                        </ul>
                    `;
                }
                
                warningsList.appendChild(warningDiv);
            });
        } else {
            warningsContainer.style.display = 'none';
        }
    }
}

function updateCharts(data) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        return;
    }
    updateMonthlyChart(data.monthly_chart_stats || data.monthly_stats);
    updateTotalChart(data.records);
    updateWeeklyChart(data.weekly_stats); 
}

function updateMonthlyChart(monthlyStats) {
    const chartTheme = getChartThemeColors();
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
                    backgroundColor: '#3498db',
                    borderColor: '#2980b9',
                    borderWidth: 1
                },
                {
                    label: t('halves'),
                    data: halfData,
                    backgroundColor: '#e74c3c',
                    borderColor: '#c0392b',
                    borderWidth: 1
                },
                {
                    label: '33cl',
                    data: thirtyThreeData,
                    backgroundColor: '#f39c12',
                    borderColor: '#e67e22',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: chartTheme.textColor
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        stepSize: 1,
                        color: chartTheme.textColor
                    }
                },
                x: {
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor
                    }
                }
            }
        }
    });
}

function updateTotalChart(records) {
    const chartTheme = getChartThemeColors();
    const ctx = document.getElementById('totalChart');
    if (!ctx) {
        console.warn('Element totalChart not found');
        return;
    }

    // Agréger les litres par jour (un point = un jour)
    const dailyLitersMap = {};
    records.forEach(r => {
        const key = r.date;
        const liters = (r.pints * 0.5) + (r.half_pints * 0.25) + (r.liters_33 * 0.33);
        if (!dailyLitersMap[key]) {
            dailyLitersMap[key] = 0;
        }
        dailyLitersMap[key] += liters;
    });

    const recordDates = Object.keys(dailyLitersMap).sort((a, b) => new Date(a) - new Date(b));
    const startDateInput = document.getElementById('start-date')?.value;
    const endDateInput = document.getElementById('end-date')?.value;
    const startDate = parseLocalDate(startDateInput || recordDates[0]);
    const endDate = parseLocalDate(endDateInput || recordDates[recordDates.length - 1]);
    const dates = [];

    if (startDate && endDate && startDate <= endDate) {
        const cursor = new Date(startDate);
        while (cursor <= endDate) {
            dates.push(formatLocalDate(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
    }

    let cumulativeLiters = 0;
    const labels = dates.map(d => parseLocalDate(d).toLocaleDateString(currentLocale()));
    const data = dates.map(d => {
        cumulativeLiters += dailyLitersMap[d] || 0;
        return parseFloat(cumulativeLiters.toFixed(2));
    });
    
    if (totalChart) {
        totalChart.destroy();
    }
    
    totalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: t('chart_cumulative_label'),
                    data: data,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: chartTheme.textColor
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor
                    }
                },
                x: {
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor
                    }
                }
            }
        }
    });
}

function updateWeeklyChart(weeklyStats) {
    const chartTheme = getChartThemeColors();
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
                backgroundColor: '#3498db',
                borderColor: '#2980b9',
                borderWidth: 2,
                borderRadius: 5
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
                    display: true,
                    text: t('chart_weekly_title'),
                    font: {
                        size: 16
                    },
                    color: chartTheme.textColor
                },
                tooltip: {
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
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor,
                        callback: function(value) {
                            return value + ' ' + t('chart_unit_liters');
                        }
                    }
                },
                x: {
                    grid: {
                        color: chartTheme.gridColor
                    },
                    ticks: {
                        color: chartTheme.textColor
                    }
                }
            }
        }
    });
}

function updateStats() {
    loadStats();
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
    const filename = `beertracker-dashboard-${startDate}-${endDate}.png`;
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
