// Run: node scripts/check-material-scan.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual screen handlers with a local catalog, without camera hardware.
async function check(screen) {
    const source = fs.readFileSync(path.join(__dirname, '../app/servicio', screen), 'utf8');
    const ast = ts.createSourceFile(screen, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let handler;
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleBarCodeScanned') {
            handler = node.initializer.getText(ast);
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(handler);
    const code = ts.transpileModule(`const scan = ${handler}; scan;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const material = { codigo_material: '001Ab', nombre: 'Material', unidad_medida: 'SERIALIZADO' };
    for (const scenario of ['found', 'unknown', 'unavailable', 'failure']) {
        const selected = [], alerts = [];
        let closed = 0;
        const target = { type: 'retirado', id: 'row-2', field: 'material' };
        const scan = vm.runInNewContext(code, {
            scannerTarget: target,
            loadDatabaseService: async () => {
                if (scenario === 'failure') throw new Error('SQLite unavailable');
                return scenario === 'unavailable' ? null : { getMaterials: async () => [material] };
            },
            selectMaterial: async (...args) => selected.push(args),
            closeScanner: () => closed++,
            Alert: { alert: (...args) => alerts.push(args) },
            updateMaterialItem: () => assert.fail('Material scan must not write a serial number'),
            captureSerialPhoto: () => assert.fail('Material scan must not capture a serial photo'),
        });
        await scan({ type: 'code128', data: scenario === 'unknown' ? '001' : ' 001aB ' });
        assert.equal(closed, 1, `${screen}: ${scenario} closes the camera`);
        assert.equal(selected.length, scenario === 'found' ? 1 : 0);
        assert.equal(alerts.length, scenario === 'found' ? 0 : 1);
        if (selected.length) {
            assert.equal(selected[0][0], material);
            assert.equal(selected[0][1], target);
        }
    }
}

Promise.all(['solo-stock.tsx', 'ejecucion.tsx'].map(check))
    .then(() => console.log('OK: material scans, unknown codes and catalog failures in both screens'))
    .catch(error => { console.error(error); process.exitCode = 1; });
