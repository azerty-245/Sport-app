
import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every page.
// The <head> here is merged with the head from other pages.
export default function Root({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

                {/* 
          This is the critical part for Social Media functionality.
          These tags ensure that when the link is shared on WhatsApp/Facebook/Twitter,
          it shows a nice title, description, and image.
        */}
                <title>Eben - Solution Digitale</title>
                <meta name="description" content="Eben est une plateforme d'optimisation digitale offrant des outils de gestion d'information et des services multimédias intégrés pour améliorer votre productivité quotidienne." />

                {/* Open Graph / Facebook / WhatsApp */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://eben-digi.vercel.app/" />
                <meta property="og:title" content="Eben - Solution Digitale" />
                <meta property="og:description" content="Eben est une plateforme d'optimisation digitale offrant des outils de gestion d'information et des services multimédias intégrés pour améliorer votre productivité quotidienne." />
                <meta property="og:image" content="https://eben-digi.vercel.app/icon.png" />
                <meta property="og:image:width" content="1024" />
                <meta property="og:image:height" content="1024" />

                {/* Twitter */}
                <meta property="twitter:card" content="summary_large_image" />
                <meta property="twitter:url" content="https://eben-digi.vercel.app/" />
                <meta property="twitter:title" content="Eben - Solution Digitale" />
                <meta property="twitter:description" content="Eben est une plateforme d'optimisation digitale offrant des outils de gestion d'information et des services multimédias intégrés pour améliorer votre productivité quotidienne." />
                <meta property="twitter:image" content="https://eben-digi.vercel.app/icon.png" />

                {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
                <ScrollViewStyleReset />

                {/* Monetag Ads & Direct Link: Delayed to allow hydration and improve performance */}
                <script dangerouslySetInnerHTML={{
                    __html: `
                        setTimeout(function() {
                            // 1. Vignette
                            (function(s){s.dataset.zone='10626370',s.src='https://gizokraijaw.net/vignette.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
                            
                            // 2. In-Page Push
                            (function(s){s.dataset.zone='10626367',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
                            
                            // 3. Direct Link Popunder Ruse
                            (function() {
                                const directLink = 'https://omg10.com/4/10626366';
                                const handleFirstClick = function() {
                                    window.open(directLink, '_blank');
                                    document.removeEventListener('click', handleFirstClick);
                                    document.removeEventListener('touchstart', handleFirstClick);
                                };
                                document.addEventListener('click', handleFirstClick, { once: true });
                                document.addEventListener('touchstart', handleFirstClick, { once: true });
                            })();
                            
                            console.log('Ads initialized with 10s delay 🚀');
                        }, 10000);
                    `
                }} />

                {/* Add any additional <head> elements that you want globally available on web... */}
            </head>
            <body>{children}</body>
        </html>
    );
}
