//@target illustrator
/*
 * RenommerCalques.jsx  —  v1.0.0
 * ----------------------------------------------------------------------------
 * FR : Renommage en masse des calques et sous-calques d'un document Illustrator.
 *      Portée : document entier, ou calque actif (+ option sous-calques).
 *      Modes : Préfixe, Suffixe, Remplacer (trouver/remplacer, casse optionnelle),
 *      Numéroter (préfixe + compteur avec padding, pas, départ),
 *      Modèle avec jetons {name}, {n}, {nn}, {nnn}, {parent}.
 *      Bouton « Analyser » : aperçu avant→après sans modification.
 *      Bouton « Appliquer » : renommage en une opération annulable
 *      (app.beginUndoGroup / endUndoGroup si disponibles).
 * EN : Batch rename of layers and sublayers in an Illustrator document.
 *      Scope: whole document, or active layer (+ include-sublayers option).
 *      Modes: Prefix, Suffix, Replace (find/replace, optional case),
 *      Number (prefix + counter with zero-padding, step, start),
 *      Template with tokens {name}, {n}, {nn}, {nnn}, {parent}.
 *      "Analyze" button: before→after preview without changing anything.
 *      "Apply" button: rename in one undoable operation
 *      (app.beginUndoGroup / endUndoGroup when available).
 *
 * Cible / Target : Illustrator CC (2018+) jusqu'aux versions récentes.
 * Statut / Status : NON TESTÉ DANS ILLUSTRATOR — syntaxe ES3 vérifiée (acorn).
 *                   NOT TESTED IN ILLUSTRATOR — ES3 syntax checked (acorn).
 * Conseil : travaillez sur une copie de votre fichier.
 * Tip     : work on a copy of your file.
 * Aucune connexion réseau, aucune collecte de données.
 * No network access, no data collection.
 *
 * Licence MIT — (c) 2026 Amirouche Amwanes. Code original.
 */

(function () {

    var VERSION = "1.0.0";

    // ------------------------------------------------------------------
    // Langue / Language (locale Illustrator ou FR par défaut)
    // ------------------------------------------------------------------
    var FR = String($.locale || app.locale || "").toLowerCase().indexOf("fr") === 0;
    function t(fr, en) { return FR ? fr : en; }

    // ------------------------------------------------------------------
    // Garde-fous / Guards
    // ------------------------------------------------------------------
    if (app.documents.length === 0) {
        alert(t("Aucun document ouvert.\nOuvrez un document puis relancez le script.",
                "No document open.\nOpen a document and run the script again."));
        return;
    }

    var doc = app.activeDocument;

    // ------------------------------------------------------------------
    // Modes / Modes
    // ------------------------------------------------------------------
    var MODE_PREFIX  = 0;
    var MODE_SUFFIX  = 1;
    var MODE_REPLACE = 2;
    var MODE_NUMBER  = 3;
    var MODE_TMPL    = 4;

    // ------------------------------------------------------------------
    // Utilitaires ES3 / ES3 helpers
    // ------------------------------------------------------------------

    function safe(fn, fallback) {
        try { return fn(); } catch (e) { return fallback; }
    }

    function padNumber(n, width) {
        var s = String(n);
        while (s.length < width) { s = "0" + s; }
        return s;
    }

    /**
     * Remplace toutes les occurrences (boucle indexOf, pas de regex).
     * Replace all occurrences (indexOf loop, no regex).
     */
    function replaceAll(haystack, needle, replacement, caseSensitive) {
        if (!needle || needle.length === 0) { return String(haystack); }
        var source = String(haystack);
        var result = "";
        var pos = 0;
        var idx;
        var cmpSrc = caseSensitive ? source : source.toLowerCase();
        var cmpNdl = caseSensitive ? String(needle) : String(needle).toLowerCase();
        var nLen = needle.length;

        while (true) {
            idx = cmpSrc.indexOf(cmpNdl, pos);
            if (idx < 0) {
                result += source.substring(pos);
                break;
            }
            result += source.substring(pos, idx);
            result += String(replacement);
            pos = idx + nLen;
        }
        return result;
    }

    /**
     * Remplace les jetons du modèle : {name}, {n}, {nn}, {nnn}, {parent}.
     * Replace template tokens: {name}, {n}, {nn}, {nnn}, {parent}.
     */
    function applyTemplate(tmpl, name, n, parentName) {
        var s = String(tmpl);
        s = replaceAll(s, "{name}", name, true);
        s = replaceAll(s, "{parent}", parentName, true);
        s = replaceAll(s, "{nnn}", padNumber(n, 3), true);
        s = replaceAll(s, "{nn}", padNumber(n, 2), true);
        s = replaceAll(s, "{n}", String(n), true);
        return s;
    }

    /**
     * Nom du calque parent, ou "" / Document.
     * Parent layer name, or "" / Document.
     */
    function getParentName(layer) {
        return safe(function () {
            var p = layer.parent;
            if (!p || p.typename === "Document") { return ""; }
            if (p.typename === "Layer") { return String(p.name || ""); }
            return "";
        }, "");
    }

    /**
     * Calcule le nouveau nom selon le mode et les options.
     * Compute the new name for the given mode and options.
     * opts.counter est un objet { value: number } muté pour Numéroter / Modèle.
     * opts.counter is a mutable { value: number } for Number / Template modes.
     */
    function computeNewName(oldName, parentName, opts) {
        var mode = opts.mode;
        var name = String(oldName);
        var n;

        if (mode === MODE_PREFIX) {
            return String(opts.text) + name;
        }
        if (mode === MODE_SUFFIX) {
            return name + String(opts.text);
        }
        if (mode === MODE_REPLACE) {
            return replaceAll(name, opts.find, opts.replace, opts.caseSensitive);
        }
        if (mode === MODE_NUMBER) {
            n = opts.counter.value;
            opts.counter.value = n + opts.step;
            return String(opts.prefix) + padNumber(n, opts.pad);
        }
        if (mode === MODE_TMPL) {
            n = opts.counter.value;
            opts.counter.value = n + opts.step;
            return applyTemplate(opts.template, name, n, parentName);
        }
        return name;
    }

    // ------------------------------------------------------------------
    // Collecte des calques / Layer collection
    // ------------------------------------------------------------------

    /**
     * Collecte récursive des calques selon les options.
     * Recursively collect layers according to options.
     * out : tableau d'objets { layer, name, parentName, skipReason }
     * out : array of { layer, name, parentName, skipReason }
     */
    function collectFromLayer(layer, includeChildren, opts, out, isRootOfScope) {
        var locked = safe(function () { return layer.locked; }, false);
        var hidden = safe(function () { return !layer.visible; }, false);
        var name = safe(function () { return String(layer.name); }, "");
        var parentName = getParentName(layer);
        var skipReason = null;

        // Le calque racine de la portée « calque actif » est toujours inclus
        // (sauf verrouillé/masqué si options), même si on n'inclut pas les enfants.
        // The root of the "active layer" scope is always included
        // (unless locked/hidden per options), even when children are excluded.
        if (opts.ignoreLocked && locked) {
            skipReason = t("verrouillé", "locked");
        } else if (opts.ignoreHidden && hidden) {
            skipReason = t("masqué", "hidden");
        }

        out.push({
            layer: layer,
            name: name,
            parentName: parentName,
            skipReason: skipReason
        });

        if (includeChildren) {
            var subs = safe(function () { return layer.layers; }, null);
            if (subs) {
                var i;
                // Illustrator : layers[0] = calque du haut / layers[0] = topmost
                for (i = 0; i < subs.length; i++) {
                    collectFromLayer(subs[i], true, opts, out, false);
                }
            }
        }
    }

    /**
     * Collecte selon la portée.
     * Collect according to scope.
     * scope : "doc" | "active"
     */
    function collectLayers(scope, includeSublayers, opts) {
        var out = [];
        var i;
        if (scope === "doc") {
            var tops = doc.layers;
            for (i = 0; i < tops.length; i++) {
                collectFromLayer(tops[i], includeSublayers, opts, out, true);
            }
        } else {
            // Calque actif (+ enfants si option)
            // Active layer (+ children if option)
            var al = doc.activeLayer;
            if (al) {
                collectFromLayer(al, includeSublayers, opts, out, true);
            }
        }
        return out;
    }

    /**
     * Construit la liste d'aperçu avant→après (sans modifier).
     * Build before→after preview list (no modification).
     */
    function buildPreview(entries, opts) {
        var counter = { value: opts.start };
        var runOpts = {
            mode: opts.mode,
            text: opts.text,
            find: opts.find,
            replace: opts.replace,
            caseSensitive: opts.caseSensitive,
            prefix: opts.prefix,
            pad: opts.pad,
            step: opts.step,
            template: opts.template,
            counter: counter
        };
        var lines = [];
        var renameCount = 0;
        var skipCount = 0;
        var sameCount = 0;
        var i, e, newName, line;

        for (i = 0; i < entries.length; i++) {
            e = entries[i];
            if (e.skipReason) {
                skipCount++;
                line = e.name + "  →  [" + t("ignoré", "skipped") + ": " + e.skipReason + "]";
                lines.push(line);
                continue;
            }
            // Avancer le compteur uniquement pour les calques non ignorés
            // Advance counter only for non-skipped layers
            newName = computeNewName(e.name, e.parentName, runOpts);
            if (newName === e.name) {
                sameCount++;
                line = e.name + "  →  " + newName + "  (" + t("inchangé", "unchanged") + ")";
            } else {
                renameCount++;
                line = e.name + "  →  " + newName;
            }
            lines.push(line);
            // Stocker le nouveau nom pour Appliquer
            // Store new name for Apply
            e.newName = newName;
        }
        return {
            lines: lines,
            renameCount: renameCount,
            skipCount: skipCount,
            sameCount: sameCount,
            total: entries.length
        };
    }

    /**
     * Applique les renommages (utilise newName déjà calculé, ou recalcule).
     * Apply renames (uses precomputed newName, or recomputes).
     */
    function applyRenames(entries, opts) {
        var counter = { value: opts.start };
        var runOpts = {
            mode: opts.mode,
            text: opts.text,
            find: opts.find,
            replace: opts.replace,
            caseSensitive: opts.caseSensitive,
            prefix: opts.prefix,
            pad: opts.pad,
            step: opts.step,
            template: opts.template,
            counter: counter
        };
        var renamed = 0;
        var skipped = 0;
        var failed = 0;
        var i, e, newName;

        var hasUndo = false;
        try {
            if (typeof app.beginUndoGroup === "function") {
                app.beginUndoGroup(t("Renommer calques", "Rename layers"));
                hasUndo = true;
            }
        } catch (eUndo) { hasUndo = false; }

        try {
            for (i = 0; i < entries.length; i++) {
                e = entries[i];
                if (e.skipReason) {
                    skipped++;
                    continue;
                }
                if (typeof e.newName === "string") {
                    newName = e.newName;
                    // Avancer le compteur pour rester cohérent si on recalcule plus tard
                    // Advance counter to stay consistent if recomputing later
                    if (opts.mode === MODE_NUMBER || opts.mode === MODE_TMPL) {
                        runOpts.counter.value += opts.step;
                    }
                } else {
                    newName = computeNewName(e.name, e.parentName, runOpts);
                }
                if (newName === e.name) { continue; }
                try {
                    e.layer.name = newName;
                    renamed++;
                } catch (eSet) {
                    failed++;
                }
            }
        } finally {
            if (hasUndo) {
                try { app.endUndoGroup(); } catch (eEnd) { /* ignore */ }
            }
        }
        return { renamed: renamed, skipped: skipped, failed: failed };
    }

    // ------------------------------------------------------------------
    // Dialogue ScriptUI / ScriptUI dialog
    // ------------------------------------------------------------------

    function showDialog() {
        var dlg = new Window("dialog", t("Renommer calques", "Rename layers") + "  v" + VERSION);
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 8;
        dlg.margins = 14;

        // --- Avertissement / Warning ---
        var tip = dlg.add("statictext", undefined,
            t("Conseil : travaillez sur une copie de votre fichier.",
              "Tip: work on a copy of your file."),
            { multiline: false });
        tip.graphics.font = ScriptUI.newFont(tip.graphics.font.name, ScriptUI.FontStyle.ITALIC, tip.graphics.font.size);

        // --- Portée / Scope ---
        var gScope = dlg.add("panel", undefined, t("Portée", "Scope"));
        gScope.orientation = "column";
        gScope.alignChildren = ["left", "top"];
        gScope.margins = 12;
        var rbDoc = gScope.add("radiobutton", undefined, t("Document entier", "Entire document"));
        var rbActive = gScope.add("radiobutton", undefined, t("Calque actif (+ enfants si option)", "Active layer (+ children if option)"));
        rbDoc.value = true;
        var cbSub = gScope.add("checkbox", undefined, t("Inclure les sous-calques (récursif)", "Include sublayers (recursive)"));
        cbSub.value = true;

        // --- Mode ---
        var gMode = dlg.add("panel", undefined, t("Mode", "Mode"));
        gMode.orientation = "column";
        gMode.alignChildren = ["left", "top"];
        gMode.margins = 12;
        var rbPrefix  = gMode.add("radiobutton", undefined, t("Préfixe", "Prefix"));
        var rbSuffix  = gMode.add("radiobutton", undefined, t("Suffixe", "Suffix"));
        var rbReplace = gMode.add("radiobutton", undefined, t("Remplacer (trouver / remplacer)", "Replace (find / replace)"));
        var rbNumber  = gMode.add("radiobutton", undefined, t("Numéroter", "Number"));
        var rbTmpl    = gMode.add("radiobutton", undefined, t("Modèle ({name}, {n}, {nn}, {nnn}, {parent})", "Template ({name}, {n}, {nn}, {nnn}, {parent})"));
        rbPrefix.value = true;

        // --- Options selon le mode / Mode-specific options ---
        var gOpts = dlg.add("panel", undefined, t("Options du mode", "Mode options"));
        gOpts.orientation = "column";
        gOpts.alignChildren = ["fill", "top"];
        gOpts.margins = 12;

        // Préfixe / Suffixe
        var rowText = gOpts.add("group");
        rowText.orientation = "row";
        rowText.alignChildren = ["left", "center"];
        rowText.add("statictext", undefined, t("Texte :", "Text:"));
        var etText = rowText.add("edittext", undefined, "");
        etText.preferredSize = [280, 22];

        // Remplacer
        var rowFind = gOpts.add("group");
        rowFind.orientation = "row";
        rowFind.alignChildren = ["left", "center"];
        rowFind.add("statictext", undefined, t("Trouver :", "Find:"));
        var etFind = rowFind.add("edittext", undefined, "");
        etFind.preferredSize = [260, 22];

        var rowRepl = gOpts.add("group");
        rowRepl.orientation = "row";
        rowRepl.alignChildren = ["left", "center"];
        rowRepl.add("statictext", undefined, t("Remplacer par :", "Replace with:"));
        var etRepl = rowRepl.add("edittext", undefined, "");
        etRepl.preferredSize = [220, 22];

        var cbCase = gOpts.add("checkbox", undefined, t("Respecter la casse", "Match case"));
        cbCase.value = false;

        // Numéroter
        var rowNum = gOpts.add("group");
        rowNum.orientation = "row";
        rowNum.alignChildren = ["left", "center"];
        rowNum.add("statictext", undefined, t("Préfixe n° :", "Number prefix:"));
        var etPrefix = rowNum.add("edittext", undefined, "Calque_");
        etPrefix.preferredSize = [100, 22];
        rowNum.add("statictext", undefined, t("Départ :", "Start:"));
        var etStart = rowNum.add("edittext", undefined, "1");
        etStart.preferredSize = [40, 22];
        rowNum.add("statictext", undefined, t("Pas :", "Step:"));
        var etStep = rowNum.add("edittext", undefined, "1");
        etStep.preferredSize = [40, 22];
        rowNum.add("statictext", undefined, t("Chiffres :", "Digits:"));
        var etPad = rowNum.add("edittext", undefined, "2");
        etPad.preferredSize = [36, 22];

        // Modèle
        var rowTmpl = gOpts.add("group");
        rowTmpl.orientation = "row";
        rowTmpl.alignChildren = ["left", "center"];
        rowTmpl.add("statictext", undefined, t("Modèle :", "Template:"));
        var etTmpl = rowTmpl.add("edittext", undefined, "{parent}_{name}_{nn}");
        etTmpl.preferredSize = [260, 22];

        var lblTmplHelp = gOpts.add("statictext", undefined,
            t("{name}=nom actuel, {n}/{nn}/{nnn}=compteur, {parent}=calque parent",
              "{name}=current name, {n}/{nn}/{nnn}=counter, {parent}=parent layer"),
            { multiline: false });

        // --- Filtres / Filters ---
        var gFilt = dlg.add("panel", undefined, t("Filtres", "Filters"));
        gFilt.orientation = "column";
        gFilt.alignChildren = ["left", "top"];
        gFilt.margins = 12;
        var cbIgnLock = gFilt.add("checkbox", undefined, t("Ignorer les calques verrouillés", "Skip locked layers"));
        cbIgnLock.value = true;
        var cbIgnHid = gFilt.add("checkbox", undefined, t("Ignorer les calques masqués", "Skip hidden layers"));
        cbIgnHid.value = true;

        // --- Aperçu / Preview ---
        var gPrev = dlg.add("panel", undefined, t("Aperçu (Analyser)", "Preview (Analyze)"));
        gPrev.orientation = "column";
        gPrev.alignChildren = ["fill", "top"];
        gPrev.margins = 12;
        var etPrev = gPrev.add("edittext", undefined, "", { multiline: true, scrolling: true, readonly: true });
        etPrev.preferredSize = [460, 140];
        var lblSummary = gPrev.add("statictext", undefined, t("Cliquez sur Analyser pour un aperçu.", "Click Analyze for a preview."));

        // --- Boutons / Buttons ---
        var gBtn = dlg.add("group");
        gBtn.orientation = "row";
        gBtn.alignment = ["right", "bottom"];
        var btnAnalyze = gBtn.add("button", undefined, t("Analyser", "Analyze"));
        var btnApply   = gBtn.add("button", undefined, t("Appliquer", "Apply"));
        var btnCancel  = gBtn.add("button", undefined, t("Annuler", "Cancel"), { name: "cancel" });

        // --- Visibilité des champs selon le mode / Field visibility by mode ---
        function currentMode() {
            if (rbPrefix.value)  { return MODE_PREFIX; }
            if (rbSuffix.value)  { return MODE_SUFFIX; }
            if (rbReplace.value) { return MODE_REPLACE; }
            if (rbNumber.value)  { return MODE_NUMBER; }
            if (rbTmpl.value)    { return MODE_TMPL; }
            return MODE_PREFIX;
        }

        function updateModeUI() {
            var m = currentMode();
            rowText.visible  = (m === MODE_PREFIX || m === MODE_SUFFIX);
            rowFind.visible  = (m === MODE_REPLACE);
            rowRepl.visible  = (m === MODE_REPLACE);
            cbCase.visible   = (m === MODE_REPLACE);
            rowNum.visible   = (m === MODE_NUMBER || m === MODE_TMPL);
            // Pour le modèle : départ/pas utiles, préfixe/chiffres moins ; on laisse visibles les compteurs
            // For template: start/step useful; leave number row visible for start/step/pad
            if (m === MODE_TMPL) {
                rowNum.visible = true;
            }
            rowTmpl.visible  = (m === MODE_TMPL);
            lblTmplHelp.visible = (m === MODE_TMPL);
            dlg.layout.layout(true);
        }

        rbPrefix.onClick  = updateModeUI;
        rbSuffix.onClick  = updateModeUI;
        rbReplace.onClick = updateModeUI;
        rbNumber.onClick  = updateModeUI;
        rbTmpl.onClick    = updateModeUI;
        updateModeUI();

        // --- Lecture des options / Read options from UI ---
        function readOpts() {
            var start = parseInt(etStart.text, 10);
            var step  = parseInt(etStep.text, 10);
            var pad   = parseInt(etPad.text, 10);
            if (isNaN(start) || start < 0) { start = 1; }
            if (isNaN(step) || step === 0) { step = 1; }
            if (isNaN(pad) || pad < 1) { pad = 1; }
            if (pad > 8) { pad = 8; }
            return {
                mode: currentMode(),
                text: etText.text,
                find: etFind.text,
                replace: etRepl.text,
                caseSensitive: cbCase.value,
                prefix: etPrefix.text,
                start: start,
                step: step,
                pad: pad,
                template: etTmpl.text,
                ignoreLocked: cbIgnLock.value,
                ignoreHidden: cbIgnHid.value,
                scope: rbDoc.value ? "doc" : "active",
                includeSublayers: cbSub.value
            };
        }

        // Cache des entrées après Analyser (pour Appliquer sans recalculer l'ordre)
        // Cached entries after Analyze (so Apply keeps the same order)
        var cachedEntries = null;
        var cachedOptsKey = null;

        function optsKey(o) {
            return [
                o.mode, o.text, o.find, o.replace, o.caseSensitive,
                o.prefix, o.start, o.step, o.pad, o.template,
                o.ignoreLocked, o.ignoreHidden, o.scope, o.includeSublayers
            ].join("|");
        }

        function doAnalyze() {
            var opts = readOpts();
            if (opts.mode === MODE_REPLACE && (!opts.find || opts.find.length === 0)) {
                alert(t("Indiquez la chaîne à trouver.", "Enter the find string."));
                return null;
            }
            if (opts.mode === MODE_TMPL && (!opts.template || opts.template.length === 0)) {
                alert(t("Indiquez un modèle.", "Enter a template."));
                return null;
            }
            var collectOpts = {
                ignoreLocked: opts.ignoreLocked,
                ignoreHidden: opts.ignoreHidden
            };
            var entries = collectLayers(opts.scope, opts.includeSublayers, collectOpts);
            if (entries.length === 0) {
                alert(t("Aucun calque dans la portée choisie.",
                        "No layers in the selected scope."));
                etPrev.text = "";
                lblSummary.text = t("Aucun calque.", "No layers.");
                cachedEntries = null;
                return null;
            }
            var preview = buildPreview(entries, opts);
            etPrev.text = preview.lines.join("\n");
            lblSummary.text = t(
                preview.total + " calque(s) — " + preview.renameCount + " à renommer, " +
                preview.sameCount + " inchangé(s), " + preview.skipCount + " ignoré(s).",
                preview.total + " layer(s) — " + preview.renameCount + " to rename, " +
                preview.sameCount + " unchanged, " + preview.skipCount + " skipped."
            );
            cachedEntries = entries;
            cachedOptsKey = optsKey(opts);
            return { entries: entries, preview: preview, opts: opts };
        }

        btnAnalyze.onClick = function () {
            doAnalyze();
        };

        btnApply.onClick = function () {
            var opts = readOpts();
            if (opts.mode === MODE_REPLACE && (!opts.find || opts.find.length === 0)) {
                alert(t("Indiquez la chaîne à trouver.", "Enter the find string."));
                return;
            }
            if (opts.mode === MODE_TMPL && (!opts.template || opts.template.length === 0)) {
                alert(t("Indiquez un modèle.", "Enter a template."));
                return;
            }

            var entries;
            var key = optsKey(opts);
            if (cachedEntries && cachedOptsKey === key) {
                entries = cachedEntries;
            } else {
                var result = doAnalyze();
                if (!result) { return; }
                entries = result.entries;
                opts = result.opts;
            }

            // Compter combien changeraient
            // Count how many would change
            var toRename = 0;
            var i;
            for (i = 0; i < entries.length; i++) {
                if (!entries[i].skipReason && entries[i].newName && entries[i].newName !== entries[i].name) {
                    toRename++;
                }
            }
            if (toRename === 0) {
                alert(t("Aucun calque à renommer avec ces options.",
                        "No layers to rename with these options."));
                return;
            }

            var ok = confirm(t(
                "Renommer " + toRename + " calque(s) ?\nCette opération est annulable (Édition > Annuler).",
                "Rename " + toRename + " layer(s)?\nThis operation is undoable (Edit > Undo)."
            ));
            if (!ok) { return; }

            var res = applyRenames(entries, opts);
            dlg.close(1);
            alert(t(
                "Terminé.\nRenommés : " + res.renamed +
                "\nIgnorés : " + res.skipped +
                (res.failed ? ("\nÉchecs : " + res.failed) : "") +
                "\n\nÉdition > Annuler pour revenir en arrière si besoin.",
                "Done.\nRenamed: " + res.renamed +
                "\nSkipped: " + res.skipped +
                (res.failed ? ("\nFailed: " + res.failed) : "") +
                "\n\nEdit > Undo to revert if needed."
            ));
        };

        dlg.center();
        dlg.show();
    }

    showDialog();

})();
