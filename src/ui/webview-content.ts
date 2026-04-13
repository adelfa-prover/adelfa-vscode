export class WebviewContent {
  constructor(
    private grammar: string,
    private theme: string,
  ) {}

  getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adelfa</title>
  <script type="module" src="https://unpkg.com/@vscode/webview-ui-toolkit@1.4.0/dist/toolkit.min.js"></script>
  <style>
    code {
      background-color: transparent;
    }
    #content {
      margin-bottom: 60px;
    }
    .button-container {
      position: fixed;
      bottom: 10px;
      right: 10px;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <h1>Adelfa</h1>

  <div id="message">
    <p>Loading</p>
  </div>

  <div id="content">
  </div>

  <div class="button-container">
    <vscode-button id="restart-button">Restart Adelfa</vscode-button>
  </div>

  <script type="module">
    import { createHighlighter } from 'https://esm.sh/shiki@1.27.2';
    const content = document.getElementById("content");
    const message = document.getElementById("message");
    const html = document.getElementsByTagName("html")[0];

    function getVar(name) {
      return window.getComputedStyle(html).getPropertyValue(name);
    }

    const highlighter = await createHighlighter({
      langs: [${this.grammar}],
      themes: ['${this.theme}']
    });

    window.addEventListener("message", async (event) => {
      message.textContent = event.data.message ?? "";
      content.innerHTML = event.data.code ? highlighter.codeToHtml(event.data.code, {
        lang: "adelfa",
        theme: "${this.theme}"
      }) : "";
    });
    content.scrollIntoView({ behavior: "smooth", block: "end" });
    const vscode = acquireVsCodeApi();

    document.getElementById("restart-button").addEventListener("click", () => {
      vscode.postMessage({ command: 'restart' });
    });

    // Send ready message only after highlighter is fully loaded
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
