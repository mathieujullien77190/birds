import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import ini from 'highlight.js/lib/languages/ini';
import bash from 'highlight.js/lib/languages/bash';
import 'highlight.js/styles/github.css';
hljs.registerLanguage('python', python); hljs.registerLanguage('ini', ini); hljs.registerLanguage('sh', bash); hljs.registerLanguage('bash', bash);
export { hljs };
