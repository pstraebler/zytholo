(function () {
    const dictionaries = {
        fr: {
            page_dashboard_title: "Tableau de Bord - Zytholo",
            page_admin_title: "Administration - Zytholo",
            page_login_title: "Zytholo - Connexion",
            page_password_title: "Changer le mot de passe - Zytholo",
            navbar_settings: "⚙️ Réglages",
            navbar_change_password: "🔒 Changer mot de passe",
            navbar_logout: "👋 Déconnexion",
            navbar_back_dashboard: "Retour au tableau de bord",
            warning_title: "⚠️ Alerte",
            add_consumption: "Ajouter une consommation",
            date: "Date",
            night_mode_activate: "🌙 Activer Mode Soirée",
            night_mode_active: "🌙 Mode Soirée ACTIF",
            beer_pints: "🍺 Pintes (50cl)",
            beer_halves: "🍻 Demis (25cl)",
            beer_33cl: "🥃 33cl",
            stats_title: "Statistiques",
            stats_from: "Depuis le",
            stats_to: "jusqu'au",
            section_step_one: "1",
            section_step_two: "2",
            section_step_three: "3",
            section_step_four: "4",
            section_step_five: "5",
            section_add_consumption_title: "Ajout de consommation",
            section_add_consumption_description: "Enregistre rapidement les bières de la soirée.",
            section_period_stats_title: "Statistiques de la période",
            section_period_stats_description: "Analyse la période choisie et son évolution dans le temps.",
            section_recurring_stats_title: "Consommations du mois et de la semaine",
            section_recurring_stats_description: "Compare le rythme du mois en cours et des dernières semaines.",
            section_medals_title: "Médailles et classements",
            section_medals_description: "Retrouve les podiums de la semaine, du mois et de l’année.",
            section_export_title: "Export des données",
            section_export_description: "Télécharge tes données brutes ou une image du dashboard.",
            update: "Mettre à jour",
            total: "Total",
            pints: "Pintes",
            halves: "Demis",
            estimated_cost: "Coût estimé",
            stats_best_evening: "Soirée record",
            stats_best_evening_empty: "Aucune donnée sur cette période.",
            stats_best_evening_on_date: "Le {date}",
            stats_best_evening_tooltip_title: "Détail des consommations",
            monthly_consumption: "Consommation par mois",
            last_four_weeks_consumption: "📊 Consommation sur les 4 dernières semaines",
            total_timeline: "Timeline totale",
            total_timeline_with_period: "Timeline totale du {start} au {end}",
            timeline_mode_personal: "Ma consommation",
            timeline_mode_all_users: "Tous les utilisateurs",
            ranking_title: "Classement des plus gros buveurs de l'année ({year})",
            ranking_week_title: "Classement des plus gros buveurs de la semaine (du {start} au {end})",
            ranking_month_title: "Classement des plus gros buveurs du mois ({month} {year})",
            ranking_empty_week: "Personne n'a bu cette semaine 😇",
            ranking_empty_month: "Personne n'a bu ce mois 😇",
            ranking_empty_year: "Personne n'a bu cette année 😇",
            ranking_other_users_title: "Classement des autres utilisateurs",
            ranking_others_empty: "Aucun autre utilisateur à afficher sur cette période.",
            medal_gold: "Or",
            medal_silver: "Argent",
            medal_bronze: "Bronze",
            rank: "Rang",
            user: "Utilisateur",
            liters_total: "Total en L",
            liters_total_short: "Total (en L)",
            export_data_title: "Exporter vos données",
            export_csv: "Télécharger en CSV",
            export_png: "Exporter le dashboard en PNG",
            admin_title: "🍺 Administration",
            success: "Succès",
            error: "Erreur",
            import_success: "✅ Import réussi",
            import_partial: "⚠️ Import avec problèmes",
            auto_created_users: "👤 Utilisateurs créés automatiquement",
            temp_password: "Mot de passe temporaire",
            temp_password_warning: "⚠️ Important:",
            temp_password_warning_text: "Ces utilisateurs ont un mot de passe temporaire. Le changement sera imposé automatiquement à leur première connexion.",
            user_management: "Gestion des utilisateurs",
            create_user: "Créer un nouvel utilisateur",
            nickname_placeholder: "Pseudo",
            password_placeholder: "Mot de passe",
            create: "Créer",
            existing_users: "Utilisateurs existants",
            new_password_placeholder: "Nouveau mot de passe",
            change_password_short: "Changer MDP",
            force_password_change_next_login: "Forcer changement MDP",
            night_mode: "🌙 Mode Soirée",
            delete: "Supprimer",
            import_export: "Import / Export de données",
            export_all_data: "Exporter toutes les données",
            export_full_csv: "Télécharger CSV complet",
            import_data: "Importer des données",
            import: "Importer",
            expected_format_label: "Format attendu:",
            expected_format_value: "Utilisateur | Date | Pintes | Demis | 33cl",
            missing_users_created: "Les utilisateurs manquants seront créés automatiquement.",
            login_username: "Pseudo",
            login_password: "Mot de passe",
            login_button: "Connexion",
            change_password_title: "🔒 Changer le mot de passe",
            current_password: "Mot de passe actuel",
            new_password: "Nouveau mot de passe",
            confirm_new_password: "Confirmer le nouveau mot de passe",
            change_password_button: "Modifier le mot de passe",
            password_change_required_message: "Vous devez changer votre mot de passe avant de continuer.",
            settings_title: "⚙️ Réglages",
            settings_language: "Langue",
            language_french: "Français",
            language_english: "English",
            settings_theme: "Thème",
            theme_light: "Clair",
            theme_dark: "Sombre",
            theme_auto: "Système",
            settings_average_beer_price: "Prix moyen d'une bière (pour 50 cL)",
            settings_three_hour_threshold: "Seuil d'alerte sur 3 heures",
            settings_weekly_days_threshold: "Seuil d'alerte jours de consommation",
            settings_water_reminder_threshold: "Seuil de rappel « verre d'eau »",
            settings_days_suffix: "jours",
            settings_disable_hint: "0 = alerte désactivée",
            settings_bac_title: "🚗 Alcoolémie",
            settings_bac_hint: "Poids et sexe permettent d'estimer votre taux d'alcool dans le sang.",
            settings_bac_weight: "Poids",
            settings_bac_sex: "Sexe",
            settings_bac_sex_unset: "Non renseigné",
            settings_bac_sex_male: "Homme",
            settings_bac_sex_female: "Femme",
            settings_bac_beer_abv: "Degré moyen des bières",
            settings_bac_legal_limit: "Seuil légal (conduite)",
            settings_bac_legal_limit_hint: "Ex. : 0,5 en France, 0,8 au Royaume-Uni/USA, 0,0 dans certains pays.",
            bac_title: "🚗 Alcoolémie estimée",
            bac_profile_missing: "Renseignez votre poids et votre sexe dans les réglages pour estimer votre taux d'alcool dans le sang.",
            bac_open_settings: "Ouvrir les réglages",
            bac_probation_note: "🔰 Permis probatoire / jeune conducteur : 0 g/L autorisé — aucun verre d'alcool.",
            bac_disclaimer: "⚠️ Estimation indicative (formule de Widmark). Elle ne remplace pas un éthylotest. En cas de doute, ne prenez pas le volant.",
            bac_verdict_ok: "✅ Sous le seuil légal ({limit} g/L)",
            bac_verdict_warn: "⚠️ Proche du seuil légal ({limit} g/L) — prudence",
            bac_verdict_no: "⛔ Au-dessus du seuil légal — ne conduisez pas",
            bac_legal_until: "Repassage estimé sous {limit} g/L vers {time}.",
            bac_sober_at: "Retour estimé à 0 g/L vers {time}.",
            save: "Enregistrer",
            record_name_modal_title: "🏆 Nommer la soirée record",
            record_name_modal_intro: "Donnez un nom à cette soirée record (facultatif).",
            record_name_placeholder: "Ex. : Anniversaire de Paul",
            record_name_clear: "Effacer le nom",
            record_name_add: "🏆 Nommer cette soirée",
            record_name_edit: "✏️ Renommer",
            confirm_delete_user: "Êtes-vous sûr ?",
            switch_to_other_language: "English",
            theme_switch_to_dark: "Activer le mode sombre",
            theme_switch_to_light: "Activer le mode clair",
            night_mode_modal_title: "🌙 Activer le Mode Soirée ?",
            night_mode_modal_intro: "Le mode soirée vous empêchera de :",
            night_mode_modal_item_1: "Décrémenter le nombre de bières",
            night_mode_modal_item_2: "Modifier la date",
            night_mode_modal_warning: "⏰ Le mode se désactivera automatiquement demain à 7h.",
            cancel: "Annuler",
            activate: "Activer",
            error_night_mode_activation: "Erreur lors de l'activation du mode soirée",
            night_mode_notification: "🌙 Mode Soirée activé ! Jusqu'à demain 7h.",
            night_mode_block_decrement: "⚠️ Mode Soirée actif : impossible de retirer une bière 😏",
            day_history_title: "Historique du jour",
            day_history_empty: "Aucune consommation enregistrée sur cette journée.",
            day_history_next_day: "après minuit",
            error_save_connection: "Erreur lors de l'enregistrement. Vérifiez votre connexion.",
            error_png_export_unavailable: "Export PNG indisponible. Vérifiez votre connexion puis réessayez.",
            alert_three_hour_title: "⚠️ Plus de {threshold}L bu sur 3h",
            alert_water_reminder_title: "💧 Plus de {threshold}L bu : pense à boire un verre d'eau !",
            alert_water_done: "J'ai bu un verre d'eau",
            alert_record_evening_title: "🏆 Nouveau record de soirée battu !",
            alert_record_evening_previous: "ancien record : {previous}L du {date}",
            alert_total: "Total",
            chart_cumulative_label: "Total cumulé (L)",
            chart_weekly_dataset: "Litres consommés",
            chart_weekly_title: "4 dernières semaines (en litres)",
            chart_unit_liters: "L",
            week_of: "Semaine du",
            days_of_drinking: "⚠️ {count} jours de consommation cette semaine ({days})",
            day_0: "lundi",
            day_1: "mardi",
            day_2: "mercredi",
            day_3: "jeudi",
            day_4: "vendredi",
            day_5: "samedi",
            day_6: "dimanche",
            error_generic_update: "Erreur lors de la modification",
            error_settings_update: "Erreur lors de l'enregistrement des réglages"
        },
        en: {
            page_dashboard_title: "Dashboard - Zytholo",
            page_admin_title: "Administration - Zytholo",
            page_login_title: "Zytholo - Login",
            page_password_title: "Change Password - Zytholo",
            navbar_settings: "⚙️ Settings",
            navbar_change_password: "🔒 Change password",
            navbar_logout: "👋 Log out",
            navbar_back_dashboard: "Back to dashboard",
            warning_title: "⚠️ Alert",
            add_consumption: "Add consumption",
            date: "Date",
            night_mode_activate: "🌙 Enable Night Mode",
            night_mode_active: "🌙 Night Mode ACTIVE",
            beer_pints: "🍺 Pints (50cl)",
            beer_halves: "🍻 Half-pints (25cl)",
            beer_33cl: "🥃 33cl",
            stats_title: "Statistics",
            stats_from: "From",
            stats_to: "to",
            section_step_one: "1",
            section_step_two: "2",
            section_step_three: "3",
            section_step_four: "4",
            section_step_five: "5",
            section_add_consumption_title: "Consumption entry",
            section_add_consumption_description: "Quickly log the beers from the evening.",
            section_period_stats_title: "Period statistics",
            section_period_stats_description: "Review the selected period and its progression over time.",
            section_recurring_stats_title: "Monthly and weekly consumption",
            section_recurring_stats_description: "Compare the current month with the last few weeks.",
            section_medals_title: "Medals and rankings",
            section_medals_description: "See the weekly, monthly and yearly podiums.",
            section_export_title: "Data export",
            section_export_description: "Download your raw data or a dashboard image.",
            update: "Update",
            total: "Total",
            pints: "Pints",
            halves: "Half-pints",
            estimated_cost: "Estimated cost",
            stats_best_evening: "Top evening",
            stats_best_evening_empty: "No data for this period.",
            stats_best_evening_on_date: "On {date}",
            stats_best_evening_tooltip_title: "Consumption details",
            monthly_consumption: "Consumption by month",
            last_four_weeks_consumption: "📊 Consumption over the last 4 weeks",
            total_timeline: "Full timeline",
            total_timeline_with_period: "Full timeline from {start} to {end}",
            timeline_mode_personal: "My consumption",
            timeline_mode_all_users: "All users",
            ranking_title: "Top drinkers ranking of the year ({year})",
            ranking_week_title: "Top drinkers ranking of the week (from {start} to {end})",
            ranking_month_title: "Top drinkers ranking of the month ({month} {year})",
            ranking_empty_week: "Nobody drank this week 😇",
            ranking_empty_month: "Nobody drank this month 😇",
            ranking_empty_year: "Nobody drank this year 😇",
            ranking_other_users_title: "Ranking of other users",
            ranking_others_empty: "No other users to display for this period.",
            medal_gold: "Gold",
            medal_silver: "Silver",
            medal_bronze: "Bronze",
            rank: "Rank",
            user: "User",
            liters_total: "Total in L",
            liters_total_short: "Total (L)",
            export_data_title: "Export your data",
            export_csv: "Download as CSV",
            export_png: "Export dashboard as PNG",
            admin_title: "🍺 Administration",
            success: "Success",
            error: "Error",
            import_success: "✅ Import successful",
            import_partial: "⚠️ Import with issues",
            auto_created_users: "👤 Automatically created users",
            temp_password: "Temporary password",
            temp_password_warning: "⚠️ Important:",
            temp_password_warning_text: "These users have a temporary password. They will be forced to change it on first login.",
            user_management: "User management",
            create_user: "Create a new user",
            nickname_placeholder: "Username",
            password_placeholder: "Password",
            create: "Create",
            existing_users: "Existing users",
            new_password_placeholder: "New password",
            change_password_short: "Change password",
            force_password_change_next_login: "Force password change",
            night_mode: "🌙 Night Mode",
            delete: "Delete",
            import_export: "Data import / export",
            export_all_data: "Export all data",
            export_full_csv: "Download full CSV",
            import_data: "Import data",
            import: "Import",
            expected_format_label: "Expected format:",
            expected_format_value: "User | Date | Pints | Half-pints | 33cl",
            missing_users_created: "Missing users will be created automatically.",
            login_username: "Username",
            login_password: "Password",
            login_button: "Login",
            change_password_title: "🔒 Change password",
            current_password: "Current password",
            new_password: "New password",
            confirm_new_password: "Confirm new password",
            change_password_button: "Update password",
            password_change_required_message: "You must change your password before continuing.",
            settings_title: "⚙️ Settings",
            settings_language: "Language",
            language_french: "Français",
            language_english: "English",
            settings_theme: "Theme",
            theme_light: "Light",
            theme_dark: "Dark",
            theme_auto: "System",
            settings_average_beer_price: "Average beer price (for 50 cL)",
            settings_three_hour_threshold: "3-hour alert threshold",
            settings_weekly_days_threshold: "Weekly drinking days alert threshold",
            settings_water_reminder_threshold: "Water reminder threshold",
            settings_days_suffix: "days",
            settings_disable_hint: "0 = alert disabled",
            settings_bac_title: "🚗 Blood alcohol",
            settings_bac_hint: "Weight and sex are used to estimate your blood alcohol level.",
            settings_bac_weight: "Weight",
            settings_bac_sex: "Sex",
            settings_bac_sex_unset: "Not set",
            settings_bac_sex_male: "Male",
            settings_bac_sex_female: "Female",
            settings_bac_beer_abv: "Average beer strength",
            settings_bac_legal_limit: "Legal driving limit",
            settings_bac_legal_limit_hint: "E.g. 0.5 in France, 0.8 in the UK/USA, 0.0 in some countries.",
            bac_title: "🚗 Estimated blood alcohol",
            bac_profile_missing: "Set your weight and sex in the settings to estimate your blood alcohol level.",
            bac_open_settings: "Open settings",
            bac_probation_note: "🔰 Probationary / novice licence: 0 g/L allowed — no alcohol at all.",
            bac_disclaimer: "⚠️ Indicative estimate (Widmark formula). It does not replace a breathalyser. When in doubt, do not drive.",
            bac_verdict_ok: "✅ Below the legal limit ({limit} g/L)",
            bac_verdict_warn: "⚠️ Close to the legal limit ({limit} g/L) — take care",
            bac_verdict_no: "⛔ Above the legal limit — do not drive",
            bac_legal_until: "Estimated back under {limit} g/L around {time}.",
            bac_sober_at: "Estimated back to 0 g/L around {time}.",
            save: "Save",
            record_name_modal_title: "🏆 Name the record evening",
            record_name_modal_intro: "Give this record evening a name (optional).",
            record_name_placeholder: "E.g. Paul's birthday",
            record_name_clear: "Clear the name",
            record_name_add: "🏆 Name this evening",
            record_name_edit: "✏️ Rename",
            confirm_delete_user: "Are you sure?",
            switch_to_other_language: "Français",
            theme_switch_to_dark: "Enable dark mode",
            theme_switch_to_light: "Enable light mode",
            night_mode_modal_title: "🌙 Enable Night Mode?",
            night_mode_modal_intro: "Night mode will prevent you from:",
            night_mode_modal_item_1: "Decreasing beer quantities",
            night_mode_modal_item_2: "Changing the date",
            night_mode_modal_warning: "⏰ Mode will automatically disable tomorrow at 7am.",
            cancel: "Cancel",
            activate: "Enable",
            error_night_mode_activation: "Error while enabling night mode",
            night_mode_notification: "🌙 Night mode enabled! Until tomorrow at 7am.",
            night_mode_block_decrement: "⚠️ Night mode is active: you cannot remove a beer 😏",
            day_history_title: "Today's history",
            day_history_empty: "No consumption recorded for this day.",
            day_history_next_day: "after midnight",
            error_save_connection: "Error while saving. Please check your connection.",
            error_png_export_unavailable: "PNG export is unavailable. Check your connection and try again.",
            alert_three_hour_title: "⚠️ More than {threshold}L consumed over 3 hours",
            alert_water_reminder_title: "💧 More than {threshold}L consumed: time for a glass of water!",
            alert_water_done: "I had a glass of water",
            alert_record_evening_title: "🏆 New evening record beaten!",
            alert_record_evening_previous: "previous record: {previous}L on {date}",
            alert_total: "Total",
            chart_cumulative_label: "Cumulative total (L)",
            chart_weekly_dataset: "Liters consumed",
            chart_weekly_title: "Last 4 weeks (in liters)",
            chart_unit_liters: "L",
            week_of: "Week of",
            days_of_drinking: "⚠️ {count} days of drinking this week ({days})",
            day_0: "Monday",
            day_1: "Tuesday",
            day_2: "Wednesday",
            day_3: "Thursday",
            day_4: "Friday",
            day_5: "Saturday",
            day_6: "Sunday",
            error_generic_update: "Error while updating",
            error_settings_update: "Error while saving settings"
        }
    };

    const languageStorageKey = "zytholo_lang";
    let currentLanguage = "en";

    function isSupported(lang) {
        return Object.prototype.hasOwnProperty.call(dictionaries, lang);
    }

    function detectBrowserLanguage() {
        const browserLanguage = (navigator.language || navigator.userLanguage || "en").toLowerCase();
        return browserLanguage.startsWith("fr") ? "fr" : "en";
    }

    function persistLanguage(lang) {
        localStorage.setItem(languageStorageKey, lang);
        document.cookie = `lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    }

    function t(key, vars) {
        const dict = dictionaries[currentLanguage] || dictionaries.en;
        let value = dict[key] || dictionaries.en[key] || key;
        if (!vars) return value;
        Object.keys(vars).forEach((varKey) => {
            value = value.replace(`{${varKey}}`, vars[varKey]);
        });
        return value;
    }

    function parseLocalDate(isoDate) {
        const parts = (isoDate || "").split("-").map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) {
            return null;
        }
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatWeekRange(start, end) {
        if (!start || !end) {
            return { start: "", end: "" };
        }

        if (currentLanguage === "fr") {
            const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
            const startOptions = sameMonth
                ? { day: "numeric" }
                : { day: "numeric", month: "long" };
            return {
                start: start.toLocaleDateString("fr-FR", startOptions),
                end: end.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
            };
        }

        const sameYear = start.getFullYear() === end.getFullYear();
        return {
            start: start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: sameYear ? undefined : "numeric" }),
            end: end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        };
    }

    function applyBasicTranslations() {
        const titleKey = document.body ? document.body.getAttribute("data-i18n-title") : null;
        if (titleKey) {
            document.title = t(titleKey);
        }

        document.querySelectorAll("[data-i18n]").forEach((element) => {
            element.textContent = t(element.getAttribute("data-i18n"));
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
            element.placeholder = t(element.getAttribute("data-i18n-placeholder"));
        });

        document.querySelectorAll("[data-i18n-html]").forEach((element) => {
            element.innerHTML = t(element.getAttribute("data-i18n-html"));
        });

        document.querySelectorAll("[data-i18n-title]").forEach((element) => {
            element.title = t(element.getAttribute("data-i18n-title"));
            element.setAttribute("aria-label", t(element.getAttribute("data-i18n-title")));
        });

        document.querySelectorAll("[data-i18n-with-year]").forEach((element) => {
            const key = element.getAttribute("data-i18n-with-year");
            const year = element.getAttribute("data-year");
            element.textContent = t(key, { year });
        });

        document.querySelectorAll("[data-i18n-with-month-year]").forEach((element) => {
            const key = element.getAttribute("data-i18n-with-month-year");
            const year = element.getAttribute("data-year");
            const month = Number(element.getAttribute("data-month"));
            const monthDate = new Date(Number(year), month - 1, 1);
            const monthLabel = monthDate.toLocaleString(currentLanguage, { month: "long" });
            element.textContent = t(key, { month: monthLabel, year });
        });

        document.querySelectorAll("[data-i18n-with-week-range]").forEach((element) => {
            const key = element.getAttribute("data-i18n-with-week-range");
            const start = parseLocalDate(element.getAttribute("data-week-start"));
            const end = parseLocalDate(element.getAttribute("data-week-end"));
            element.textContent = t(key, formatWeekRange(start, end));
        });
    }

    function applyConfirmMessages() {
        document.querySelectorAll("[data-i18n-confirm]").forEach((form) => {
            if (form.dataset.i18nConfirmBound === "true") {
                return;
            }
            form.addEventListener("submit", function (event) {
                const key = form.getAttribute("data-i18n-confirm");
                if (!window.confirm(t(key))) {
                    event.preventDefault();
                }
            });
            form.dataset.i18nConfirmBound = "true";
        });
    }

    function getToggleFlag() {
        return currentLanguage === "fr" ? "🇬🇧" : "🇫🇷";
    }

    function updateLanguageButtons() {
        document.querySelectorAll(".language-toggle-btn").forEach((button) => {
            button.textContent = getToggleFlag();
            button.title = t("switch_to_other_language");
            button.setAttribute("aria-label", t("switch_to_other_language"));
        });
    }

    function applyTranslations() {
        document.documentElement.lang = currentLanguage;
        applyBasicTranslations();
        applyConfirmMessages();
        updateLanguageButtons();
    }

    function setLanguage(lang, persist = true) {
        const normalizedLang = (lang || "").toLowerCase();
        if (!isSupported(normalizedLang)) {
            return;
        }
        currentLanguage = normalizedLang;
        if (persist) {
            persistLanguage(currentLanguage);
        }
        applyTranslations();
        document.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLanguage } }));
    }

    function toggleLanguage() {
        setLanguage(currentLanguage === "fr" ? "en" : "fr");
    }

    function initLanguage() {
        const forceBrowserLanguage = document.body && document.body.getAttribute("data-force-browser-language") === "true";
        if (forceBrowserLanguage) {
            setLanguage(detectBrowserLanguage(), false);
            return;
        }

        const storedLanguage = localStorage.getItem(languageStorageKey);
        const initialLanguage = isSupported(storedLanguage) ? storedLanguage : detectBrowserLanguage();
        setLanguage(initialLanguage, true);

        document.querySelectorAll(".language-toggle-btn").forEach((button) => {
            if (button.dataset.languageBound === "true") {
                return;
            }
            button.addEventListener("click", toggleLanguage);
            button.dataset.languageBound = "true";
        });
    }

    window.ZytholoI18n = {
        t,
        initLanguage,
        setLanguage,
        toggleLanguage,
        getCurrentLanguage: function () { return currentLanguage; }
    };

    document.addEventListener("DOMContentLoaded", initLanguage);
})();
