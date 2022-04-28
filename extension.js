const vscode = require('vscode');
const packageJson = require('./package.json');
const clickForInfo = 'Click for more information about ';
const extensionDisplayName = packageJson.displayName;
const throttleDuration = 500;
const throttle = {
    document: null,
    timeout: null
};
const SQLLanguageId = ['sql', 'oraclesql'];

let outputChannel = null;
let diagnosticCollection = null;

function lint(document) {
    if (!SQLLanguageId.includes(document.languageId)) {
        return;
    }

    const diagnostics = [];

    const parse = (document.languageId === 'sql') ? require('ut-tsql-lexer') : require('ut-plsql-lexer');

    try {
        var parsed = parse.parse(document.getText());
        if (parsed.lint.length) {
            parsed.lint.forEach(function(item) {
                let range = new vscode.Range(new vscode.Position(item.startLine - 1, item.startColumn - 1), new vscode.Position(item.endLine - 1, item.endColumn - 1));
                const diagnostic = new vscode.Diagnostic(range, item.message, vscode.DiagnosticSeverity.Warning);
                diagnostic.code = 'file://' + item.code;
                diagnostic.source = extensionDisplayName;
                diagnostics.push(diagnostic);
            });
        };
    } catch (e) {
        let range = new vscode.Range(new vscode.Position(e.location.start.line, e.location.start.column), new vscode.Position(e.location.start.line, e.location.start.column + 1));
        const diagnostic = new vscode.Diagnostic(range, e.message, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = extensionDisplayName;
        diagnostics.push(diagnostic);
    }
    diagnosticCollection.set(document.uri, diagnostics);
}

// Suppresses a pending lint for the specified document
function suppressLint(document) {
    if (throttle.timeout && (document === throttle.document)) {
        clearTimeout(throttle.timeout);
        throttle.document = null;
        throttle.timeout = null;
    }
}
function requestLint(document) {
    suppressLint(document);
    throttle.document = document;
    throttle.timeout = setTimeout(function waitThrottleDuration() {
        // Do not use throttle.document in this function; it may have changed
        lint(document);
        suppressLint(document);
    }, throttleDuration);
}

function didChangeTextDocument(change) {
    requestLint(change.document);
}

// Handles the didCloseTextDocument event
function didCloseTextDocument(document) {
    suppressLint(document);
    diagnosticCollection.delete(document.uri);
}

// Lint all open files
function lintOpenFiles() {
    (vscode.workspace.textDocuments || []).forEach(lint);
}

// Implements CodeActionsProvider.provideCodeActions to provide information and fix rule violations
function provideCodeActions(document, range, codeActionContext) {
    const codeActions = [];
    const diagnostics = codeActionContext.diagnostics || [];
    diagnostics.filter(function filterDiagnostic(diagnostic) {
        return diagnostic.source === extensionDisplayName;
    }).forEach(function forDiagnostic(diagnostic) {
        const ruleNameAlias = diagnostic.message.split(':')[0];
        codeActions.push({
            title: clickForInfo + ruleNameAlias,
            command: 'vscode.open',
            arguments: [ vscode.Uri.parse(diagnostic.code) ]
        });
    });
    return codeActions;
}

function activate(context) {
    // Create OutputChannel
    outputChannel = vscode.window.createOutputChannel(extensionDisplayName);
    context.subscriptions.push(outputChannel);

    // Hook up to workspace events
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(lint),
        vscode.workspace.onDidChangeTextDocument(didChangeTextDocument),
        vscode.workspace.onDidCloseTextDocument(didCloseTextDocument),
    );

    // Register CodeActionsProvider
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(SQLLanguageId, {
            provideCodeActions: provideCodeActions
        })
    );

    // Create DiagnosticCollection
    diagnosticCollection = vscode.languages.createDiagnosticCollection(extensionDisplayName);
    context.subscriptions.push(diagnosticCollection);

    // Lint already-open files
    lintOpenFiles();
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
