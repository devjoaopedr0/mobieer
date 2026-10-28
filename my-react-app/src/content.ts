// Conteúdo da landing: textos, portfólio e contatos. Para atualizar o site, mude aqui.

export const INSTAGRAM_URL = "https://instagram.com/mobieer";
export const WHATSAPP_URL =
  "https://wa.me/5585999691441?text=Ol%C3%A1!%20Vim%20pelo%20site%20e%20gostaria%20de%20um%20or%C3%A7amento.";

export const HERO = {
  title:
    "Há 11 anos criando ambientes que contam histórias. Mais de 400 clientes têm a Mobieer presente em seus espaços — uma trajetória construída com confiança, qualidade e credibilidade.",
  subtitle: "Solicite um orçamento em nosso formulário que entraremos em contato com você para mais informações.",
};

export const PROJECT_TYPES = ["Residencial", "Empresarial", "Corporativo"] as const;

export type BlogPost = { title: string; items?: string[]; text?: string };

export const BLOG: BlogPost[] = [
  {
    title: "5 formas de manter seus móveis planejados em ótimo estado:",
    items: [
      "**Limpeza regular:** pano macio e úmido, sem produtos abrasivos.",
      "**Longe do sol direto:** evita desbotar e ressecar o acabamento.",
      "**Apoios adequados:** feltros e protetores evitam riscos e marcas.",
      "**Umidade sob controle:** ambientes muito úmidos danificam os materiais.",
      "**Sem excesso de peso:** distribua a carga e respeite o limite de prateleiras e gavetas.",
    ],
  },
  {
    title: "Você sabe o que é um painel muxarabi ?",
    text: "É um painel vazado, inspirado na arquitetura árabe, que filtra a luz e a ventilação e dá privacidade sem fechar o ambiente. Funciona como divisória, fachada de armário ou detalhe decorativo.",
  },
  {
    title: "5 dicas para escolher a melhor loja de móveis planejados para você:",
    items: [
      "Pesquise a reputação, as avaliações e o portfólio da loja.",
      "Veja de perto a qualidade dos materiais e das ferragens.",
      "Confira se o projeto é realmente personalizado.",
      "Compare prazo de entrega, garantia e formas de pagamento.",
      "Prefira quem acompanha a montagem e o pós-venda.",
    ],
  },
  {
    title: "A diferença entre laca e MDF Cristallo está nos materiais e acabamentos:",
    text: "A laca é uma pintura aplicada sobre o MDF, com cor sob medida e acabamento fosco ou alto brilho. O MDF Cristallo já sai da fábrica com uma superfície de alto brilho, mais resistente a riscos e com cores pré-definidas.",
  },
  {
    title: "Qual a diferença entre MDF e MDP:",
    text: "O MDF é feito de fibras de madeira prensadas: é homogêneo e ótimo para usinagem, curvas e pintura. O MDP é feito de partículas em camadas: é mais resistente à flexão e ideal para prateleiras, laterais e portas retas.",
  },
];

export type Category = "cozinha" | "quarto" | "sala";

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "cozinha", label: "COZINHA" },
  { key: "quarto", label: "QUARTO" },
  { key: "sala", label: "SALA" },
];

export const PORTFOLIO: { src: string; cat: Category; alt: string }[] = [
  { src: "/img/p-aaaa3.jpg", cat: "cozinha", alt: "Cozinha planejada" },
  { src: "/img/p33.jpg", cat: "cozinha", alt: "Cozinha planejada" },
  { src: "/img/p32.jpg", cat: "cozinha", alt: "Cozinha planejada" },
  { src: "/img/p34.jpg", cat: "quarto", alt: "Quarto planejado" },
  { src: "/img/p10.jpg", cat: "quarto", alt: "Quarto planejado" },
  { src: "/img/p5.jpg", cat: "quarto", alt: "Quarto planejado" },
  { src: "/img/p31.jpg", cat: "sala", alt: "Sala planejada" },
  { src: "/img/p30.jpg", cat: "sala", alt: "Sala planejada" },
  { src: "/img/p25.jpg", cat: "sala", alt: "Sala planejada" },
];

export const DIFFERENTIALS: { icon: string; label: string }[] = [
  { icon: "M3 21h3V4h9v17h3v2H3zm5-15v15h5V6zm3 7h1v2h-1zM16 4h3v17h-2V6h-1z", label: "Móveis com fabricação industrial" },
  { icon: "M11 2h2v7.3l6.3-3.7 1 1.7L14 11l6.3 3.7-1 1.7L13 12.7V22h-2v-9.3l-6.3 3.7-1-1.7L10 11 3.7 7.3l1-1.7L11 9.3z", label: "Ferragens de marcas de alto padrão." },
  { icon: "M2.6 15.5 15.5 2.6l5.9 5.9L8.5 21.4zm3 0 2.9 2.9 1.4-1.4-1.5-1.4.7-.7 1.4 1.4 1.4-1.4-2.1-2.1.7-.7 2.1 2.1 1.4-1.4-1.4-1.4.7-.7 1.4 1.4 1.4-1.4-2.1-2.1.7-.7 2.1 2.1 1.4-1.4L15.5 5.4z", label: "Nossos módulos são 100% editáveis" },
  { icon: "m12 2 3 6.6 7.2.7-5.4 4.8 1.6 7.1L12 17.5l-6.4 3.7 1.6-7.1L1.8 9.3 9 8.6z", label: "Móveis com 5 anos de Garantia" },
  { icon: "M2 5h20v14H2zm2 2v2h16V7zm0 5v5h16v-5zm2 2h5v1.5H6z", label: "Diversas formas de pagamentos" },
  { icon: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16m1 3v4.6l3.4 3.4-1.4 1.4-4-4V7z", label: "Compromisso e entrega com qualidade" },
];
