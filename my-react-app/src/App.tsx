import { Fragment, useState } from "react";
import { BLOG, CATEGORIES, DIFFERENTIALS, HERO, INSTAGRAM_URL, PORTFOLIO, WHATSAPP_URL, type Category } from "./content";
import { QuoteForm } from "./QuoteForm";

const INSTAGRAM_ICON =
  "M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2m0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6m5.3-3.3a1 1 0 1 1 0 2 1 1 0 0 1 0-2";

/** "**negrito:** resto" vira <strong>negrito:</strong> resto */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  );
}

function Header() {
  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <a href="#inicio" className="logo"><img src="/img/logo.png" alt="Mobieer Planejados" /></a>
        <nav className="nav">
          <a href="#portfolio">Portfólio</a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener">Instagram</a>
          <a href="#formmob" className="btn-outline">Solicitar<br />Orçamento</a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-inner">
        <div className="hero-text">
          <h3>{HERO.title}</h3>
          <p>{HERO.subtitle}</p>
        </div>
        <QuoteForm />
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="about wrap">
      <div className="about-box">
        <h4>SOBRE A MOBIEER</h4>
        <h2>Móveis Planejados de<br />Alto padrão</h2>
        <p>
          Somos um escritório de móveis planejados localizada na Av. Barão de Studart 2740, <strong>possuímos fabricação local</strong>, contamos com a
          tecnologia de máquinas de <strong>alta precisão e projetos personalizados</strong> para melhor atender nossos Clientes e Parceiros.
        </p>
      </div>
    </section>
  );
}

function Blog() {
  return (
    <section className="blog">
      <div className="wrap">
        <h2>Blogs</h2>
        <div className="accordion">
          {BLOG.map((post, i) => (
            <details key={post.title} open={i === 0}>
              <summary>{post.title}</summary>
              {post.items ? (
                <ol>{post.items.map((item) => <li key={item}><Rich text={item} /></li>)}</ol>
              ) : (
                <p>{post.text}</p>
              )}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Portfolio() {
  const [cat, setCat] = useState<Category>("cozinha");
  return (
    <section id="portfolio" className="portfolio wrap">
      <h2>Portfólio</h2>
      <div className="filters" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c.key} className={c.key === cat ? "active" : undefined} onClick={() => setCat(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="gallery">
        {PORTFOLIO.filter((p) => p.cat === cat).map((p) => (
          <a key={p.src} href={p.src} target="_blank" rel="noopener">
            <img src={p.src} alt={p.alt} loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  );
}

function Differentials() {
  return (
    <section className="diff wrap">
      <div className="diff-head">
        <h2>Nossos<br />Diferenciais</h2>
        <p>Seu ambiente do jeito que você sempre sonhou. Confere nossos diferenciais:</p>
      </div>
      <div className="diff-grid">
        {DIFFERENTIALS.map((d) => (
          <div key={d.label}>
            <svg viewBox="0 0 24 24"><path d={d.icon} /></svg>
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Instagram() {
  return (
    <section className="insta wrap">
      <h2>Instagram</h2>
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener" className="insta-btn" aria-label="Instagram da Mobieer">
        <svg viewBox="0 0 24 24"><path d={INSTAGRAM_ICON} /></svg>
      </a>
    </section>
  );
}

function Contact() {
  return (
    <section className="contact wrap">
      <div>
        <svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
        <div><h4>Telefone</h4><p><a href="tel:+558530164530">(85) 3016-4530</a><br /><a href="tel:+5585999691441">(85) 99969-1441</a></p></div>
      </div>
      <div>
        <svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2m0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12m0 2a3 3 0 0 1 3 3c0 2.3-3 5-3 5s-3-2.7-3-5a3 3 0 0 1 3-3" /></svg>
        <div><h4>Nosso Endereço</h4><p><a href="https://maps.google.com/?q=Av.+Barão+de+Studart,+2740,+Fortaleza" target="_blank" rel="noopener">Av. Barão de Studart,<br />2740 Dionísio Torres</a></p></div>
      </div>
      <div>
        <svg viewBox="0 0 24 24"><path d="M3 9.5 12 3l9 6.5V20H3zM3 9.5l9 6 9-6M7 7.5V5h10v2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <div><h4>E-mail</h4><p><a href="mailto:contato@mobieer.com">contato@mobieer.com</a></p></div>
      </div>
      <div>
        <svg viewBox="0 0 24 24"><path d={INSTAGRAM_ICON} /></svg>
        <div><h4>Instagram</h4><p><a href={INSTAGRAM_URL} target="_blank" rel="noopener">@mobieer</a></p></div>
      </div>
    </section>
  );
}

function WhatsApp() {
  return (
    <a className="whatsapp" href={WHATSAPP_URL} target="_blank" rel="noopener">
      <span className="wa-bubble">Como podemos ajudar?</span>
      <span className="wa-icon" aria-label="WhatsApp">
        <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8M8.6 7.3c-.2 0-.5 0-.7.3s-1 .9-1 2.3 1 2.7 1.1 2.9 2 3.1 4.9 4.3c2.4 1 2.9.8 3.4.7s1.7-.7 1.9-1.4.2-1.2.2-1.4l-.5-.3-1.9-.9c-.3-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.9-2.1c-.2-.5-.4-.4-.6-.4z" /></svg>
      </span>
    </a>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <main id="inicio">
        <Hero />
        <About />
        <Blog />
        <Portfolio />
        <Differentials />
        <Instagram />
        <Contact />
      </main>
      <WhatsApp />
    </>
  );
}
