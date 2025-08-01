import('./dist/index.esm.js').then(({ parse, unparse }) => {
  const testCases = [
    "f'{value:.2f}'",
  ];
  
  testCases.forEach(code => {
    console.log('Testing:', code);
    try {
      const ast = parse(code);
      const result = unparse(ast);
      console.log('  Success, unparsed:', JSON.stringify(result));
    } catch (e) {
      console.log('  Error:', e.message);
    }
  });
});
