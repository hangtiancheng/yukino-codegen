export type QuickPrompt = {
  readonly label: string;
  readonly prompt: string;
};

export const quickPrompts: ReadonlyArray<QuickPrompt> = [
  {
    label: "Personal Blog",
    prompt:
      "Build a personal blog with Vite, React, TypeScript (strict mode), and Tailwind CSS. Use lucide-react for all icons, and you may use daisyUI as the component library on top of Tailwind. Include a hero section with an author bio, a responsive article grid with cover images, tags, and reading time, an article detail view with styled prose and code blocks, a sidebar listing recent posts and categories, and a footer with social links. Fully type all components, props, and data models, use semantic HTML and reusable components, and keep a clean typography-first design that adapts from mobile to desktop.",
  },
  {
    label: "Online Store",
    prompt:
      "Build an online store with Vite, Vue 3, TypeScript (strict mode), and Tailwind CSS using the Composition API and single-file components. Use @lucide/vue for all icons, and you may use daisyUI as the component library on top of Tailwind. Include a hero banner, a product grid with hover cards, category and price filters, a search box, a slide-in cart drawer with quantity controls and totals, and a checkout summary with a promo code field. Manage cart state with a composable or Pinia, keep prices and inventory in a typed mock data module, fully type all components and stores, and make the layout responsive with clear empty and loading states.",
  },
  {
    label: "Analytics Dashboard",
    prompt:
      "Build an analytics dashboard with Vite, Lit, TypeScript (strict mode), and Tailwind CSS using native web components. Use the lucide core package for icons by rendering its SVG markup inside templates. Because Tailwind's global stylesheet does not pierce Shadow DOM, import the compiled Tailwind CSS and inject it into every component's shadow root via static styles with unsafeCSS or a shared Constructable Stylesheet (adoptedStyleSheets); daisyUI classes may be used within those injected styles. Include a sidebar navigation, a top bar with a light/dark theme toggle, KPI stat cards with trend indicators, SVG or CSS charts for traffic and revenue, and a sortable data table with pagination. Fully type all elements, properties, and events, define custom design tokens in the Tailwind theme, and keep the layout responsive with skeleton placeholders while data loads.",
  },
  {
    label: "Portfolio Website",
    prompt:
      "Build a portfolio website for a product designer with Vite, TypeScript (strict mode), and Tailwind CSS, and pick the frontend framework that best fits the design. Use the matching lucide icon package for the chosen framework (lucide-react, @lucide/vue, or lucide), and you may use daisyUI as the component library on top of Tailwind. Include a striking hero with name and role, a case-study grid with project covers and outcomes, a case-study detail view with problem, process, and result sections, an about section with skills and timeline, and a contact form with client-side validation. Fully type all components and data models, and focus on strong visual hierarchy, generous whitespace, subtle motion, and full responsiveness from mobile to desktop.",
  },
];
