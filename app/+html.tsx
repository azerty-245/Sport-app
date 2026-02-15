
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
                <title>Sport Zone - Live & Streaming</title>
                <meta name="description" content="Regardez les matchs de football en direct, suivez les scores et l'actualité sportive sur Sport Zone." />

                {/* Open Graph / Facebook / WhatsApp */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://sport-app-three-pi.vercel.app/" />
                <meta property="og:title" content="Sport Zone - Live & Streaming" />
                <meta property="og:description" content="Regardez les matchs de football en direct, suivez les scores et l'actualité sportive sur Sport Zone." />
                <meta property="og:image" content="https://sport-app-three-pi.vercel.app/icon.png" />
                <meta property="og:image:width" content="1024" />
                <meta property="og:image:height" content="1024" />

                {/* Twitter */}
                <meta property="twitter:card" content="summary_large_image" />
                <meta property="twitter:url" content="https://sport-app-three-pi.vercel.app/" />
                <meta property="twitter:title" content="Sport Zone - Live & Streaming" />
                <meta property="twitter:description" content="Regardez les matchs de football en direct, suivez les scores et l'actualité sportive sur Sport Zone." />
                <meta property="twitter:image" content="https://sport-app-three-pi.vercel.app/icon.png" />

                {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
                <ScrollViewStyleReset />

                {/* Monetag MultiTag Ads - Temporarily Disabled
                <script src="https://quge5.com/88/tag.min.js" data-zone="211479" async data-cfasync="false"></script>
                */}

                {/* Add any additional <head> elements that you want globally available on web... */}
            </head>
            <body>{children}</body>
        </html>
    );
}
