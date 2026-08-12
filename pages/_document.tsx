import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" data-theme="linki-dark" suppressHydrationWarning>
      <Head>
        <link rel="icon" type="image/x-icon" href="/logo_linki.ico" />
        <link rel="icon" type="image/png" href="/logo_linki.png" />
        <link rel="apple-touch-icon" href="/logo_linki.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="dark light" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var p = localStorage.getItem('linki-theme') || 'system';
                  var dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  document.documentElement.setAttribute('data-theme', dark ? 'linki-dark' : 'linki-light');
                  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
                } catch(e){}
              })();
            `,
          }}
        />
      </Head>
      <body className="min-h-screen bg-base-100 text-base-content antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
