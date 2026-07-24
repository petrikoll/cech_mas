import { Document, Packer, Paragraph, TextRun, AlignmentType, Header } from "docx";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "";
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!GEMINI_API_KEY) {
  console.error("ChybĂ„â€šĂ‚Â­ GEMINI_API_KEY v .env");
  console.warn("Tvorba dokumentu bude bez GEMINI_API_KEY fungovat pouze bez AI.");
}

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: [
          "'self'",
          "http://localhost:3000",
          "https://portal-040d.onrender.com"
        ]
      }
    }
  })
);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

function decodeBasicAuthHeader(authHeader = "") {
  if (!authHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const encoded = authHeader.slice(6);
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch (_error) {
    return null;
  }
}

function basicAuthMiddleware(req, res, next) {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
    return next();
  }

  const credentials = decodeBasicAuthHeader(req.headers.authorization || "");

  if (
    credentials?.username === BASIC_AUTH_USER &&
    credentials?.password === BASIC_AUTH_PASSWORD
  ) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Databáze", charset="UTF-8"');
  return res.status(401).send("Vyžadováno přihlášení.");
}

if (BASIC_AUTH_USER && BASIC_AUTH_PASSWORD) {
  console.log("Basic Auth je aktivní.");
} else if (BASIC_AUTH_USER || BASIC_AUTH_PASSWORD) {
  console.warn("Basic Auth není aktivní: musí být nastavené BASIC_AUTH_USER i BASIC_AUTH_PASSWORD.");
}
app.use(basicAuthMiddleware);


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,

  // Ä‚ËÄąâ€şĂ˘â‚¬Â¦ KLĂ„â€šÄąÂ¤Ä‚â€žÄąĹˇOVĂ„â€šÄąÄ„ Ă„Ä…Ă‚ÂĂ„â€šĂ‚ÂDEK PRO RENDER
  keyGenerator: (req) => req.ip
});

app.use("/api", limiter);

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

const contactStore = {
  exekutori: [],
  banky: [],
  ossz: [],
  pojistovny: [],
  soudy: []
};

const DATA_FILES = [
  path.join(__dirname, "data", "default-core.json"),
  path.join(__dirname, "data", "default-exekutori.json")
];

const PDF_RELEVANCE_RULES = `
### OBECNĂ„â€šĂ˘â‚¬Â° PRAVIDLO PRO Ä‚â€žÄąĹˇTENĂ„â€šÄąÂ¤ PDF A POSOUZENĂ„â€šÄąÂ¤ RELEVANCE DAT

VĂ„Ä…Ă„Äľdy nejprve pĂ„Ä…Ă˘â€žËeÄ‚â€žÄąÂ¤ti celĂ„â€šĂ‚Â© PDF, ne pouze prvnĂ„â€šĂ‚Â­ strĂ„â€šĂ‹â€ˇnku, prvnĂ„â€šĂ‚Â­ blok textu nebo prvnĂ„â€šĂ‚Â­ rozpoznanou sekci.

Nejprve urÄ‚â€žÄąÂ¤ete typ dokumentu podle jeho obsahu, napĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­klad:
- exekuÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ nĂ„â€šĂ‹â€ˇvrh
- usnesenĂ„â€šĂ‚Â­
- rozsudek
- vĂ„â€šĂ‹ĹĄzva
- formulĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žË
- insolvenÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ nĂ„â€šĂ‹â€ˇvrh
- nĂ„â€šĂ‹â€ˇvrh na oddluĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â­
- Ă„Ä…Ă„Äľaloba
- vyjĂ„â€šĂ‹â€ˇdĂ„Ä…Ă˘â€žËenĂ„â€šĂ‚Â­
- jinĂ„â€šĂ‚Â© procesnĂ„â€šĂ‚Â­ podĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­

Teprve po urÄ‚â€žÄąÂ¤enĂ„â€šĂ‚Â­ typu dokumentu posuÄ‚â€žÄąÄ…, kterĂ„â€šĂ‚Â© Ă„â€šÄąĹşdaje jsou pro danĂ„â€šĂ‹ĹĄ typ dokumentu relevantnĂ„â€šĂ‚Â­.

PĂ„Ä…Ă˘â€žËi extrakci nikdy neignoruj identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kĂ„Ä…ÄąÂ» jen proto, Ă„Ä…Ă„Äľe nejsou v zĂ„â€šĂ‹â€ˇhlavĂ„â€šĂ‚Â­ nebo na prvnĂ„â€šĂ‚Â­ strĂ„â€šĂ‹â€ˇnce. RelevantnĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje mohou bĂ„â€šĂ‹ĹĄt uvedeny takĂ„â€šĂ‚Â©:
- v oznaÄ‚â€žÄąÂ¤enĂ„â€šĂ‚Â­ Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kĂ„Ä…ÄąÂ»
- v odĂ„Ä…ÄąÂ»vodnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­
- ve vĂ„â€šĂ‹ĹĄroku
- v tabulkĂ„â€šĂ‹â€ˇch
- v pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­lohĂ„â€šĂ‹â€ˇch
- v poznĂ„â€šĂ‹â€ˇmkĂ„â€šĂ‹â€ˇch
- v dalĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ch blocĂ„â€šĂ‚Â­ch dokumentu

U kaĂ„Ä…Ă„ÄľdĂ„â€šĂ‚Â©ho Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­ka vĂ„Ä…Ă„Äľdy aktivnÄ‚â€žĂ˘â‚¬Ĺź hledej a vyuĂ„Ä…Ă„Äľij vĂ„Ä…Ă‹â€ˇechny relevantnĂ„â€šĂ‚Â­ identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje, zejmĂ„â€šĂ‚Â©na:
- jmĂ„â€šĂ‚Â©no a pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jmenĂ„â€šĂ‚Â­ / nĂ„â€šĂ‹â€ˇzev subjektu
- adresa bydliĂ„Ä…Ă‹â€ˇtÄ‚â€žĂ˘â‚¬Ĺź / sĂ„â€šĂ‚Â­dla / doruÄ‚â€žÄąÂ¤ovacĂ„â€šĂ‚Â­ adresa
- datum narozenĂ„â€šĂ‚Â­
- rodnĂ„â€šĂ‚Â© Ä‚â€žÄąÂ¤Ă„â€šĂ‚Â­slo
- IÄ‚â€žÄąĹˇO
- datovĂ„â€šĂ‹â€ˇ schrĂ„â€šĂ‹â€ˇnka
- e-mail
- telefon
- dalĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ identifikĂ„â€šĂ‹â€ˇtory, pokud jsou zjevnÄ‚â€žĂ˘â‚¬Ĺź souÄ‚â€žÄąÂ¤Ă„â€šĂ‹â€ˇstĂ„â€šĂ‚Â­ identifikace Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­ka

Pokud dokument nepouĂ„Ä…Ă„ÄľĂ„â€šĂ‚Â­vĂ„â€šĂ‹â€ˇ vĂ„â€šĂ‹ĹĄrazy Ä‚ËĂ˘â€šÂ¬ÄąÄľpovinnĂ„â€šĂ‹ĹĄÄ‚ËĂ˘â€šÂ¬Äąâ€ş a Ä‚ËĂ˘â€šÂ¬ÄąÄľoprĂ„â€šĂ‹â€ˇvnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‹ĹĄÄ‚ËĂ˘â€šÂ¬Äąâ€ş, mapuj role podle vĂ„â€šĂ‹ĹĄznamu a typu dokumentu:
- exekuce: oprĂ„â€šĂ‹â€ˇvnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‹ĹĄ / povinnĂ„â€šĂ‹ĹĄ
- insolvence a oddluĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â­: vÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă˘â€žËitel / dluĂ„Ä…Ă„ÄľnĂ„â€šĂ‚Â­k
- civilnĂ„â€šĂ‚Â­ Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­: Ă„Ä…Ă„Äľalobce / Ă„Ä…Ă„ÄľalovanĂ„â€šĂ‹ĹĄ
- nĂ„â€šĂ‹â€ˇvrhovĂ„â€šĂ‹â€ˇ Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­: navrhovatel / odpĂ„Ä…ÄąÂ»rce
- obecnÄ‚â€žĂ˘â‚¬Ĺź: Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­k Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­ podle vĂ„â€šĂ‹ĹĄznamu v textu

PĂ„Ä…Ă˘â€žËi vĂ„â€šĂ‚Â­ce vĂ„â€šĂ‹ĹĄskytech stejnĂ„â€šĂ‚Â©ho Ă„â€šÄąĹşdaje pouĂ„Ä…Ă„Äľij tento prioritnĂ„â€šĂ‚Â­ princip:
1. Ă„â€šÄąĹşdaj vĂ„â€šĂ‹ĹĄslovnÄ‚â€žĂ˘â‚¬Ĺź pĂ„Ä…Ă˘â€žËiĂ„Ä…Ă˘â€žËazenĂ„â€šĂ‹ĹĄ ke konkrĂ„â€šĂ‚Â©tnĂ„â€šĂ‚Â­ osobÄ‚â€žĂ˘â‚¬Ĺź nebo subjektu
2. Ă„â€šÄąĹşdaj uvedenĂ„â€šĂ‹ĹĄ v sekci oznaÄ‚â€žÄąÂ¤enĂ„â€šĂ‚Â­ Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kĂ„Ä…ÄąÂ»
3. Ă„â€šÄąĹşdaj uvedenĂ„â€šĂ‹ĹĄ ve formulĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËovĂ„â€šĂ‚Â©m poli
4. Ă„â€šÄąĹşdaj uvedenĂ„â€šĂ‹ĹĄ jinde v textu, pokud je zjevnÄ‚â€žĂ˘â‚¬Ĺź pĂ„Ä…Ă˘â€žËiĂ„Ä…Ă˘â€žËaditelnĂ„â€šĂ‹ĹĄ ke konkrĂ„â€šĂ‚Â©tnĂ„â€šĂ‚Â­mu Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kovi

Pokud existuje vĂ„â€šĂ‚Â­ce adres, rozliĂ„Ä…Ă‹â€ˇuj podle vĂ„â€šĂ‹ĹĄznamu:
- trvalĂ„â€šĂ‚Â© bydliĂ„Ä…Ă‹â€ˇtÄ‚â€žĂ˘â‚¬Ĺź
- doruÄ‚â€žÄąÂ¤ovacĂ„â€šĂ‚Â­ adresa
- sĂ„â€šĂ‚Â­dlo
- provozovna

Pokud typ adresy nenĂ„â€šĂ‚Â­ jasnĂ„â€šĂ‹ĹĄ, pouĂ„Ä…Ă„Äľij ji jako obecnou adresu Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­ka.

NevynechĂ„â€šĂ‹â€ˇvej relevantnĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje jen proto, Ă„Ä…Ă„Äľe nejsou poĂ„Ä…Ă„ÄľadovĂ„â€šĂ‹â€ˇny ve vĂ„Ä…Ă‹â€ˇech typech dokumentĂ„Ä…ÄąÂ». VĂ„Ä…Ă„Äľdy posuzuj relevanci vzhledem ke konkrĂ„â€šĂ‚Â©tnĂ„â€šĂ‚Â­mu typu dokumentu.

Pokud je Ă„â€šÄąĹşdaj v PDF uveden jasnÄ‚â€žĂ˘â‚¬Ĺź a je relevantnĂ„â€šĂ‚Â­ pro identifikaci Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­ka nebo pro vyplnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­ vĂ„â€šĂ‹ĹĄslednĂ„â€šĂ‚Â©ho dokumentu, pouĂ„Ä…Ă„Äľij jej.

Pokud je Ă„â€šÄąĹşdaj neÄ‚â€žÄąÂ¤itelnĂ„â€šĂ‹ĹĄ, neĂ„â€šÄąĹşplnĂ„â€šĂ‹ĹĄ nebo nejistĂ„â€šĂ‹ĹĄ:
- nevymĂ„â€šĂ‹ĹĄĂ„Ä…Ă‹â€ˇlej ho
- nedopoÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­tĂ„â€šĂ‹â€ˇvej ho
- nepĂ„Ä…Ă˘â€žËepisuj ho odhadem
- ponech odpovĂ„â€šĂ‚Â­dajĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ pole prĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‚Â©

Pokud je v dokumentu dostatek Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ» pro rozpoznĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ role osoby, ale role nenĂ„â€šĂ‚Â­ pojmenovĂ„â€šĂ‹â€ˇna pĂ„Ä…Ă˘â€žËesnÄ‚â€žĂ˘â‚¬Ĺź, urÄ‚â€žÄąÂ¤ete ji podle kontextu dokumentu.

CĂ„â€šĂ‚Â­lem je vĂ„Ä…Ă„Äľdy:
- pĂ„Ä…Ă˘â€žËeÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st celĂ„â€šĂ‚Â© PDF
- urÄ‚â€žÄąÂ¤it typ dokumentu
- urÄ‚â€žÄąÂ¤it role Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kĂ„Ä…ÄąÂ»
- vyhodnotit relevantnost Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ»
- vytÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă„Äľit vĂ„Ä…Ă‹â€ˇechny relevantnĂ„â€šĂ‚Â­ identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje pro danĂ„â€šĂ‹ĹĄ typ dokumentu
- nic podstatnĂ„â€šĂ‚Â©ho nevynechat

### DOPLĂ„Ä…Ă˘â‚¬Ë‡UJĂ„â€šÄąÂ¤CĂ„â€šÄąÂ¤ PRAVIDLO PRO EXTRAKCI Ă„â€šÄąË‡Ä‚â€žÄąĹˇASTNĂ„â€šÄąÂ¤KĂ„Ä…Ă‚Â®

U Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kĂ„Ä…ÄąÂ» Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­ vĂ„Ä…Ă„Äľdy samostatnÄ‚â€žĂ˘â‚¬Ĺź vyhodnocuj:
- kdo je hlavnĂ„â€šĂ‚Â­ osoba nebo subjekt
- jakĂ„â€šĂ‹â€ˇ je jeho role v dokumentu
- kterĂ„â€šĂ‚Â© identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje k nÄ‚â€žĂ˘â‚¬Ĺźmu patĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­
- kterĂ„â€šĂ‚Â© z tÄ‚â€žĂ˘â‚¬Ĺźchto Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ» jsou relevantnĂ„â€šĂ‚Â­ pro vĂ„â€šĂ‹ĹĄstup

Neber pouze prvnĂ„â€šĂ‚Â­ nalezenĂ„â€šĂ‹ĹĄ Ă„â€šÄąĹşdaj. VĂ„Ä…Ă„Äľdy zkontroluj, zda nejsou v dalĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ch Ä‚â€žÄąÂ¤Ă„â€šĂ‹â€ˇstech PDF uvedeny doplĂ„Ä…Ă‚ÂujĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ nebo pĂ„Ä…Ă˘â€žËesnÄ‚â€žĂ˘â‚¬ĹźjĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje stejnĂ„â€šĂ‚Â©ho Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­ka.
`;


const PDF_IDENTITY_SPLIT_RULES = `
### PRAVIDLO PRO ODDÄ‚â€žÄąË‡LENĂ„â€šÄąÂ¤ IDENTIFIKAÄ‚â€žÄąĹˇNĂ„â€šÄąÂ¤CH Ă„â€šÄąË‡DAJĂ„Ä…Ă‚Â® ODESĂ„â€šÄąÂ¤LATELE

Pole senderName smĂ„â€šĂ‚Â­ obsahovat pouze:
- jmĂ„â€šĂ‚Â©no a pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jmenĂ„â€šĂ‚Â­ fyzickĂ„â€šĂ‚Â© osoby
- nebo nĂ„â€šĂ‹â€ˇzev prĂ„â€šĂ‹â€ˇvnickĂ„â€šĂ‚Â© osoby

Do pole senderName nikdy nevklĂ„â€šĂ‹â€ˇdej:
- adresu
- rodnĂ„â€šĂ‚Â© Ä‚â€žÄąÂ¤Ă„â€šĂ‚Â­slo
- datum narozenĂ„â€šĂ‚Â­
- IÄ‚â€žÄąĹˇO
- datovou schrĂ„â€šĂ‹â€ˇnku
- e-mail
- telefon
- vĂ„â€šĂ‚Â­ceĂ„Ä…Ă˘â€žËĂ„â€šĂ‹â€ˇdkovĂ„â€šĂ‹ĹĄ identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ blok

Pole senderAddress smĂ„â€šĂ‚Â­ obsahovat pouze adresu nebo doruÄ‚â€žÄąÂ¤ovacĂ„â€šĂ‚Â­ adresu odesĂ„â€šĂ‚Â­latele.

Pokud PDF obsahuje identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje fyzickĂ„â€šĂ‚Â© osoby, rozdÄ‚â€žĂ˘â‚¬Ĺźl je takto:
- jmĂ„â€šĂ‚Â©no a pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jmenĂ„â€šĂ‚Â­ -> senderName
- adresa -> senderAddress
- datum narozenĂ„â€šĂ‚Â­ -> senderBirthDate
- rodnĂ„â€šĂ‚Â© Ä‚â€žÄąÂ¤Ă„â€šĂ‚Â­slo -> senderBirthNumber

Pokud PDF obsahuje identifikaÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje prĂ„â€šĂ‹â€ˇvnickĂ„â€šĂ‚Â© osoby, rozdÄ‚â€žĂ˘â‚¬Ĺźl je takto:
- nĂ„â€šĂ‹â€ˇzev subjektu -> senderName
- sĂ„â€šĂ‚Â­dlo -> senderAddress
- IÄ‚â€žÄąĹˇO -> senderIco

Pokud nÄ‚â€žĂ˘â‚¬ĹźkterĂ„â€šĂ‹ĹĄ z tÄ‚â€žĂ˘â‚¬Ĺźchto Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ» nenĂ„â€šĂ‚Â­ jistĂ„â€šĂ‹ĹĄ, nehĂ„â€šĂ‹â€ˇdej ho a vraĂ„Ä…Ă„â€ž prĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ Ă„Ä…Ă˘â€žËetÄ‚â€žĂ˘â‚¬Ĺźzec.
`;

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeSenderName(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  return raw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const lower = s.toLowerCase();
      if (lower.includes("r. Ä‚â€žÄąÂ¤")) return false;
      if (lower.includes("rodnĂ„â€šĂ‚Â© Ä‚â€žÄąÂ¤Ă„â€šĂ‚Â­slo")) return false;
      if (lower.includes("nar.")) return false;
      if (lower.includes("narozen")) return false;
      if (lower.includes("datum narozenĂ„â€šĂ‚Â­")) return false;
      if (lower.includes("iÄ‚â€žÄąÂ¤o")) return false;
      if (/\d{6}\/?\d{3,4}/.test(s)) return false;
      if (/\d/.test(s) && /\d{3}\s?\d{2}/.test(s) && /[A-Za-z]/.test(s)) return false;
      return true;
    })
    .join(" ")
    .trim();
}

function sanitizeSenderAddress(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  return raw
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const lower = s.toLowerCase();
      if (lower.includes("r. Ä‚â€žÄąÂ¤")) return false;
      if (lower.includes("rodnĂ„â€šĂ‚Â© Ä‚â€žÄąÂ¤Ă„â€šĂ‚Â­slo")) return false;
      if (lower.includes("nar.")) return false;
      if (lower.includes("narozen")) return false;
      if (lower.includes("datum narozenĂ„â€šĂ‚Â­")) return false;
      if (lower.includes("iÄ‚â€žÄąÂ¤o")) return false;
      if (lower.includes("datovĂ„â€šĂ‹â€ˇ schrĂ„â€šĂ‹â€ˇnka")) return false;
      if (lower.includes("e-mail")) return false;
      if (lower.includes("telefon")) return false;
      if (/\d{6}\/?\d{3,4}/.test(s)) return false;
      if (/^iÄ‚â€žÄąÂ¤o[:\s]/i.test(s)) return false;
      return true;
    })
    .join(", ")
    .trim();
}


function buildSearchText(...parts) {
  return parts.map((p) => normalizeText(p).toLowerCase()).filter(Boolean).join(" ");
}

function dedupeById(list) {
  const seen = new Map();
  for (const item of list) seen.set(item.id, item);
  return [...seen.values()];
}

function countAllContacts() {
  return Object.values(contactStore).reduce((sum, arr) => sum + arr.length, 0);
}

function mergeContacts(imported) {
  for (const key of Object.keys(contactStore)) {
    contactStore[key] = dedupeById([...(contactStore[key] || []), ...(imported[key] || [])]);
  }
}

function getAllContacts(category = "all", q = "") {
  const cats = category === "all" ? Object.keys(contactStore) : [category];
  const query = normalizeText(q).toLowerCase();
  const result = [];

  for (const cat of cats) {
    for (const item of contactStore[cat] || []) {
      if (!query || item.search.includes(query)) result.push(item);
    }
  }

  return result;
}

function safeJsonParse(text) {
  const cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

function buildDocxFilenameFromTitle(title) {
  const raw = normalizeText(title) || "listina";
  const withoutDiacritics = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const safe = withoutDiacritics
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${safe || "listina"}.docx`;
}

function normalizeExekutorRecord(ex, idx) {
  const fullName = normalizeText(ex.jmeno_plne) || [ex.titul_pred, ex.jmeno, ex.prijmeni].filter(Boolean).join(" ").trim() || "Neuvedeno";
  const street = normalizeText(ex.adresa?.ulice);
  const city = normalizeText(ex.adresa?.mesto);
  const psc = normalizeText(ex.adresa?.psc);
  const fullAddress = [street, city, psc].filter(Boolean).join(", ");
  const mesto = city || normalizeText(ex.urad) || "Neuvedeno";
  const ds = normalizeText(ex.datova_schranka) || "---";
  const tel = normalizeText(ex.telefon_display?.[0]) || normalizeText(ex.telefon?.[0]) || "---";
  const email = normalizeText(ex.email) || "---";
  const web = normalizeText(ex.web_display) || normalizeText(ex.web) || "---";

  return {
    id: `ex_${normalizeText(ex.cislo) || idx}`,
    nazev: `Exekutorsk\u00fd \u00fa\u0159ad: ${fullName}`,
    mesto,
    adresa: fullAddress || mesto,
    ds,
    tel,
    email,
    web,

oteviraciDoba:
  normalizeText(ex.oteviraci_doba_text) ||
  normalizeText(ex.uredni_hodiny_osobni_text) ||
  "---",

    category: "exekutori",
    source: normalizeText(ex.zdroj) || "default-exekutori",
    search: buildSearchText(fullName, fullAddress, mesto, ds, tel, email, web)
  };
}

function normalizeUnifiedRecord(item, idx) {
  const type = normalizeText(item.typ_subjektu);
  let targetCat = null;
  if (type === "banka") targetCat = "banky";
  if (type === "pojistovna" || type === "zdravotni_pojistovna") targetCat = "pojistovny";
  if (type === "socialni_zabezpeceni") targetCat = "ossz";
  if (type === "soud") targetCat = "soudy";
  if (!targetCat) return null;

  const nazev = normalizeText(item.nazev_subjektu) || "Neuvedeno";
  const mesto = normalizeText(item.nejblizsi_fyzicka_pobocka) || normalizeText(item.kraj) || normalizeText(item.adresa_pobocky) || "Ă„â€šÄąË‡stĂ„Ä…Ă˘â€žËedĂ„â€šĂ‚Â­";
  const adresa = normalizeText(item.adresa_pobocky) || normalizeText(item.nejblizsi_fyzicka_pobocka) || normalizeText(item.kraj) || "Neuvedeno";
  const ds = normalizeText(item.datova_schranka) || "---";
  const tel = normalizeText(item.telefon) || "---";
  const email = normalizeText(item.email) || "---";
  const web = normalizeText(item.web_kontakt) || "---";
  const oteviraciDoba = normalizeText(item.oteviraci_doba) || "---";
  const code = normalizeText(item.kod_subjektu);

  return {
    id: `imp_${targetCat}_${code || idx}_${nazev}`,
    nazev: code ? `${nazev} (${code})` : nazev,
    mesto,
    adresa,
    ds,
    tel,
    email,
    web,
    oteviraciDoba,
    category: targetCat,
    source: normalizeText(item.zdroj) || "default-core",
    search: buildSearchText(nazev, code, mesto, adresa, ds, tel, email, web, item.kraj, oteviraciDoba)
  };
}

function normalizeContactsFromJson(parsed) {
  const out = { exekutori: [], banky: [], ossz: [], pojistovny: [], soudy: [] };

  if (Array.isArray(parsed) && (parsed[0]?.jmeno_plne || parsed[0]?.prijmeni)) {
    parsed.forEach((ex, idx) => out.exekutori.push(normalizeExekutorRecord(ex, idx)));
    return out;
  }

  if (parsed?.data && Array.isArray(parsed.data)) {
    parsed.data.forEach((item, idx) => {
      const normalized = normalizeUnifiedRecord(item, idx);
      if (!normalized) return;
      out[normalized.category].push(normalized);
    });
    return out;
  }

  throw new Error("NepodporovanĂ„â€šĂ‹ĹĄ formĂ„â€šĂ‹â€ˇt JSON.");
}

function loadContactsFromFiles() {
  let loadedFiles = 0;
  for (const filePath of DATA_FILES) {
    if (!fs.existsSync(filePath)) {
      console.log(`VĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­ soubor nebyl nalezen: ${path.basename(filePath)}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const imported = normalizeContactsFromJson(parsed);
      mergeContacts(imported);
      loadedFiles += 1;
      const importedCount = Object.values(imported).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`NaÄ‚â€žÄąÂ¤ten soubor ${path.basename(filePath)}: ${importedCount} zĂ„â€šĂ‹â€ˇznamĂ„Ä…ÄąÂ»`);
    } catch (error) {
      console.error(`Chyba pĂ„Ä…Ă˘â€žËi naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­tĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ ${path.basename(filePath)}: ${error.message}`);
    }
  }
  console.log(`VĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­ soubory naÄ‚â€žÄąÂ¤teny: ${loadedFiles}/${DATA_FILES.length}`);
  console.log(`Celkem kontaktĂ„Ä…ÄąÂ» po startu: ${countAllContacts()}`);
}

async function postToGemini(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "NeznĂ„â€šĂ‹â€ˇmĂ„â€šĂ‹â€ˇ chyba AI sluĂ„Ä…Ă„Äľby.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI nevrĂ„â€šĂ‹â€ˇtila Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‹ĹĄ obsah.");
  return safeJsonParse(text);
}



function detectDocumentType(prompt = "", aiContext = "") {
  const text = `${normalizeText(prompt)} ${normalizeText(aiContext)}`.toLowerCase();
  if (text.includes("splĂ„â€šĂ‹â€ˇtkovĂ„â€šĂ‹ĹĄ kalendĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žË") || text.includes("splatkovy kalendar")) return "installment";
  if (text.includes("zastavenĂ„â€šĂ‚Â­ exekuce") || text.includes("zastaveni exekuce")) return "stop_execution";
  if (text.includes("odklad exekuce") || text.includes("odklad vĂ„â€šĂ‹ĹĄkonu") || text.includes("odklad vykonu")) return "postponement";
  if (text.includes("souÄ‚â€žÄąÂ¤innost") || text.includes("soucinnost")) return "cooperation";
  if (text.includes("vyĂ„Ä…Ă‹â€ˇkrtnutĂ„â€šĂ‚Â­ ze soupisu") || text.includes("vyĂ„Ä…Ă‹â€ˇkrtnuti ze soupisu")) return "exclusion";
  if (text.includes("slouÄ‚â€žÄąÂ¤enĂ„â€šĂ‚Â­ exekucĂ„â€šĂ‚Â­") || text.includes("slouceni exekuci")) return "merge_executions";
  if (text.includes("vyluÄ‚â€žÄąÂ¤ovacĂ„â€šĂ‚Â­ Ă„Ä…Ă„Äľaloba") || text.includes("vylucovaci zaloba")) return "exclusion_lawsuit";
  if (text.includes("pĂ„Ä…Ă˘â€žËeruĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ oddluĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â­") || text.includes("preruseni oddluzeni")) return "debt_relief_pause";
  if (text.includes("odpor proti platebnĂ„â€šĂ‚Â­mu rozkazu") || text.includes("odpor proti platebnimu rozkazu")) return "payment_order_opposition";
  return "generic";
}

function getDocumentProfile(type) {
  const profiles = {
    installment: {
      label: "NĂ„â€šĂ‚ÂVRH SPLĂ„â€šĂ‚ÂTKOVĂ„â€šĂ˘â‚¬Â°HO KALENDĂ„â€šĂ‚ÂĂ„Ä…Ă‚ÂE",
      system: "Jde o nĂ„â€šĂ‹â€ˇvrh dobrovolnĂ„â€šĂ‚Â©ho splĂ„â€šĂ‹â€ˇtkovĂ„â€šĂ‚Â©ho kalendĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËe adresovanĂ„â€šĂ‹ĹĄ vÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă˘â€žËiteli nebo instituci. Nejde o soudnĂ„â€šĂ‚Â­ Ă„Ä…Ă„Äľalobu ani procesnĂ„â€šĂ‚Â­ nĂ„â€šĂ‹â€ˇvrh. PiĂ„Ä…Ă‹â€ˇ smĂ„â€šĂ‚Â­rnÄ‚â€žĂ˘â‚¬Ĺź, vÄ‚â€žĂ˘â‚¬ĹźcnÄ‚â€žĂ˘â‚¬Ĺź a prakticky. NenazĂ„â€šĂ‹ĹĄvej text uznĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­m dluhu, pokud to vĂ„â€šĂ‹ĹĄslovnÄ‚â€žĂ˘â‚¬Ĺź neplyne z kontextu.",
      user: "UveÄ‚â€žÄąÄ… realistickĂ„â€šĂ‹ĹĄ nĂ„â€šĂ‹â€ˇvrh splĂ„â€šĂ‹â€ˇcenĂ„â€šĂ‚Â­, dĂ„Ä…ÄąÂ»vod Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdosti a zdĂ„Ä…ÄąÂ»razni snahu o dobrovolnĂ„â€šĂ‚Â© Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ zĂ„â€šĂ‹â€ˇvazku."
    },
    stop_execution: {
      label: "NĂ„â€šĂ‚ÂVRH NA ZASTAVENĂ„â€šÄąÂ¤ EXEKUCE",
      system: "Jde o procesnĂ„â€šĂ‚Â­ nĂ„â€šĂ‹â€ˇvrh na zastavenĂ„â€šĂ‚Â­ exekuce. Text musĂ„â€šĂ‚Â­ mĂ„â€šĂ‚Â­t styl formĂ„â€šĂ‹â€ˇlnĂ„â€šĂ‚Â­ho procesnĂ„â€šĂ‚Â­ho podĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­. V zĂ„â€šĂ‹â€ˇvÄ‚â€žĂ˘â‚¬Ĺźru musĂ„â€šĂ‚Â­ bĂ„â€šĂ‹ĹĄt jasnĂ„â€šĂ‹ĹĄ nĂ„â€šĂ‹â€ˇvrh, aby exekuce byla zastavena v uvedenĂ„â€šĂ‚Â©m rozsahu. Pracuj pĂ„Ä…Ă˘â€žËesnÄ‚â€žĂ˘â‚¬Ĺź se skutkovĂ„â€šĂ‹ĹĄmi tvrzenĂ„â€šĂ‚Â­mi, dĂ„Ä…ÄąÂ»vody a dĂ„Ä…ÄąÂ»kazy uvedenĂ„â€šĂ‹ĹĄmi v kontextu.",
      user: "Zachovej procesnĂ„â€šĂ‚Â­ styl a oddÄ‚â€žĂ˘â‚¬Ĺźl skutkovĂ„â€šĂ‹ĹĄ stav, prĂ„â€šĂ‹â€ˇvnĂ„â€šĂ‚Â­ dĂ„Ä…ÄąÂ»vody, dĂ„Ä…ÄąÂ»kazy a nĂ„â€šĂ‹â€ˇvrh vĂ„â€šĂ‹ĹĄroku."
    },
    postponement: {
      label: "Ă„Ä…Ă‹ĹĄĂ„â€šĂ‚ÂDOST O ODKLAD EXEKUCE",
      system: "Jde o Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdost o odklad exekuce. Nejde o zastavenĂ„â€šĂ‚Â­ exekuce ani o Ă„Ä…Ă„Äľalobu. ZdĂ„Ä…ÄąÂ»razni doÄ‚â€žÄąÂ¤asnost pĂ„Ä…Ă˘â€žËekĂ„â€šĂ‹â€ˇĂ„Ä…Ă„Äľek, pĂ„Ä…Ă˘â€žËimÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă˘â€žËenost odkladu a oÄ‚â€žÄąÂ¤ekĂ„â€šĂ‹â€ˇvanĂ„â€šĂ‚Â© obnovenĂ„â€šĂ‚Â­ plnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­ nebo jinĂ„â€šĂ‚Â© Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­.",
      user: "PopiĂ„Ä…Ă‹â€ˇ konkrĂ„â€šĂ‚Â©tnĂ„â€šĂ‚Â­ dĂ„Ä…ÄąÂ»vody odkladu, navrĂ„Ä…Ă„Äľenou dobu a oÄ‚â€žÄąÂ¤ekĂ„â€šĂ‹â€ˇvanĂ„â€šĂ‹ĹĄ dalĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ vĂ„â€šĂ‹ĹĄvoj."
    },
    cooperation: {
      label: "Ă„Ä…Ă‹ĹĄĂ„â€šĂ‚ÂDOST O SOUÄ‚â€žÄąĹˇINNOST",
      system: "Jde o Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdost o souÄ‚â€žÄąÂ¤innost nebo poskytnutĂ„â€šĂ‚Â­ informacĂ„â€šĂ‚Â­ Ä‚â€žÄąÂ¤i listin. Nejde o Ă„Ä…Ă„Äľalobu ani o nĂ„â€šĂ‹â€ˇvrh na soudnĂ„â€šĂ‚Â­ rozhodnutĂ„â€šĂ‚Â­. Text mĂ„â€šĂ‹â€ˇ bĂ„â€šĂ‹ĹĄt struÄ‚â€žÄąÂ¤nĂ„â€šĂ‹ĹĄ, vÄ‚â€žĂ˘â‚¬ĹźcnĂ„â€šĂ‹ĹĄ a pĂ„Ä…Ă˘â€žËesnÄ‚â€žĂ˘â‚¬Ĺź popsat, jakou souÄ‚â€žÄąÂ¤innost mĂ„â€šĂ‹â€ˇ adresĂ„â€šĂ‹â€ˇt poskytnout.",
      user: "UveÄ‚â€žÄąÄ… pĂ„Ä…Ă˘â€žËesnÄ‚â€žĂ˘â‚¬Ĺź, co se Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdĂ„â€šĂ‹â€ˇ, proÄ‚â€žÄąÂ¤ je to potĂ„Ä…Ă˘â€žËebnĂ„â€šĂ‚Â© a v jakĂ„â€šĂ‚Â© pĂ„Ä…Ă˘â€žËimÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă˘â€žËenĂ„â€šĂ‚Â© lhĂ„Ä…ÄąÂ»tÄ‚â€žĂ˘â‚¬Ĺź mĂ„â€šĂ‹â€ˇ bĂ„â€šĂ‹ĹĄt souÄ‚â€žÄąÂ¤innost poskytnuta."
    },
    exclusion: {
      label: "NĂ„â€šĂ‚ÂVRH NA VYĂ„Ä…Ă‚Â KRTNUTĂ„â€šÄąÂ¤ VÄ‚â€žÄąË‡CI ZE SOUPISU EXEKUCE",
      system: "Jde o nĂ„â€šĂ‹â€ˇvrh na vyĂ„Ä…Ă‹â€ˇkrtnutĂ„â€šĂ‚Â­ vÄ‚â€žĂ˘â‚¬Ĺźci ze soupisu exekuce. DĂ„Ä…ÄąÂ»raz dej na tvrzenĂ„â€šĂ‚Â­ o vlastnictvĂ„â€šĂ‚Â­ tĂ„Ä…Ă˘â€žËetĂ„â€šĂ‚Â­ osoby nebo jinĂ„â€šĂ‚Â©m prĂ„â€šĂ‹â€ˇvu vyluÄ‚â€žÄąÂ¤ujĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­m soupis. UveÄ‚â€žÄąÄ… popis vÄ‚â€žĂ˘â‚¬Ĺźci, dĂ„Ä…ÄąÂ»vody, dĂ„Ä…ÄąÂ»kazy a jasnĂ„â€šĂ‹ĹĄ nĂ„â€šĂ‹â€ˇvrh na vyĂ„Ä…Ă‹â€ˇkrtnutĂ„â€šĂ‚Â­.",
      user: "ZdĂ„Ä…ÄąÂ»razni vlastnickĂ„â€šĂ‚Â© prĂ„â€šĂ‹â€ˇvo, identifikaci vÄ‚â€žĂ˘â‚¬Ĺźci a dĂ„Ä…ÄąÂ»kazy, kterĂ„â€šĂ‚Â© vlastnictvĂ„â€šĂ‚Â­ podporujĂ„â€šĂ‚Â­."
    },
    merge_executions: {
      label: "NĂ„â€šĂ‚ÂVRH NA SLOUÄ‚â€žÄąĹˇENĂ„â€šÄąÂ¤ EXEKUCĂ„â€šÄąÂ¤",
      system: "Jde o nĂ„â€šĂ‹â€ˇvrh na spojenĂ„â€šĂ‚Â­ nebo slouÄ‚â€žÄąÂ¤enĂ„â€šĂ‚Â­ exekuÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ch Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­. Text mĂ„â€šĂ‹â€ˇ bĂ„â€šĂ‹ĹĄt procesnĂ„â€šĂ‚Â­, pĂ„Ä…Ă˘â€žËehlednĂ„â€šĂ‹ĹĄ a musĂ„â€šĂ‚Â­ vysvÄ‚â€žĂ˘â‚¬Ĺźtlit, proÄ‚â€žÄąÂ¤ je spojenĂ„â€šĂ‚Â­ Ă„â€šÄąĹşÄ‚â€žÄąÂ¤elnĂ„â€šĂ‚Â© a hospodĂ„â€šĂ‹â€ˇrnĂ„â€šĂ‚Â©. V zĂ„â€šĂ‹â€ˇvÄ‚â€žĂ˘â‚¬Ĺźru formuluj jasnĂ„â€šĂ‹ĹĄ nĂ„â€šĂ‹â€ˇvrh na spojenĂ„â€šĂ‚Â­ Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­.",
      user: "ZvĂ„â€šĂ‹ĹĄrazni spoleÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â©ho oprĂ„â€šĂ‹â€ˇvnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â©ho, totoĂ„Ä…Ă„Äľnost Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­kĂ„Ä…ÄąÂ», pĂ„Ä…Ă˘â€žËehled Ă„Ä…Ă˘â€žËĂ„â€šĂ‚Â­zenĂ„â€šĂ‚Â­ a dĂ„Ä…ÄąÂ»vody hospodĂ„â€šĂ‹â€ˇrnosti."
    },
    exclusion_lawsuit: {
      label: "VYLUÄ‚â€žÄąĹˇOVACĂ„â€šÄąÂ¤ Ă„Ä…Ă‹ĹĄALOBA",
      system: "Jde o vyluÄ‚â€žÄąÂ¤ovacĂ„â€šĂ‚Â­ Ă„Ä…Ă„Äľalobu podĂ„â€šĂ‹â€ˇvanou k soudu. Text musĂ„â€šĂ‚Â­ mĂ„â€šĂ‚Â­t procesnĂ„â€šĂ‚Â­ soudnĂ„â€šĂ‚Â­ styl a zĂ„Ä…Ă˘â€žËetelnÄ‚â€žĂ˘â‚¬Ĺź oddÄ‚â€žĂ˘â‚¬ĹźlenĂ„â€šĂ‚Â© Ă„â€šÄąĹşÄ‚â€žÄąÂ¤astnĂ„â€šĂ‚Â­ky, skutkovĂ„â€šĂ‹ĹĄ stav, dĂ„Ä…ÄąÂ»kazy a Ă„Ä…Ă„ÄľalobnĂ„â€šĂ‚Â­ nĂ„â€šĂ‹â€ˇvrh. Nejde o pouhou Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdost ani dopis exekutorovi.",
      user: "V zĂ„â€šĂ‹â€ˇvÄ‚â€žĂ˘â‚¬Ĺźru uveÄ‚â€žÄąÄ… Ă„Ä…Ă„ÄľalobnĂ„â€šĂ‚Â­ petit smÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă˘â€žËujĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ k vylouÄ‚â€žÄąÂ¤enĂ„â€šĂ‚Â­ vÄ‚â€žĂ˘â‚¬Ĺźci z exekuce a pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­padnÄ‚â€žĂ˘â‚¬Ĺź i nĂ„â€šĂ‹â€ˇvrh na nĂ„â€šĂ‹â€ˇhradu nĂ„â€šĂ‹â€ˇkladĂ„Ä…ÄąÂ»."
    },
    debt_relief_pause: {
      label: "Ă„Ä…Ă‹ĹĄĂ„â€šĂ‚ÂDOST O PĂ„Ä…Ă‚ÂERUĂ„Ä…Ă‚Â ENĂ„â€šÄąÂ¤ ODDLUĂ„Ä…Ă‹ĹĄENĂ„â€šÄąÂ¤",
      system: "Jde o Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdost v insolvenÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ vÄ‚â€žĂ˘â‚¬Ĺźci o pĂ„Ä…Ă˘â€žËeruĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ oddluĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â­. Nejde o exekuÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ podĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­. Text mĂ„â€šĂ‹â€ˇ zdĂ„Ä…ÄąÂ»raznit doÄ‚â€žÄąÂ¤asnĂ„â€šĂ‚Â© pĂ„Ä…Ă˘â€žËekĂ„â€šĂ‹â€ˇĂ„Ä…Ă„Äľky plnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­, jejich zĂ„â€šĂ‹â€ˇvaĂ„Ä…Ă„Äľnost a oÄ‚â€žÄąÂ¤ekĂ„â€šĂ‹â€ˇvanĂ„â€šĂ‚Â© obnovenĂ„â€šĂ‚Â­ Ă„Ä…Ă˘â€žËĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‚Â©ho plnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­.",
      user: "UveÄ‚â€žÄąÄ… dĂ„Ä…ÄąÂ»vody pĂ„Ä…Ă˘â€žËeruĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­, navrĂ„Ä…Ă„Äľenou dobu a informaci, jak a kdy se mĂ„â€šĂ‹â€ˇ obnovit plnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­ povinnostĂ„â€šĂ‚Â­."
    },
    payment_order_opposition: {
      label: "ODPOR PROTI PLATEBNĂ„â€šÄąÂ¤MU ROZKAZU",
      system: "Jde o procesnĂ„â€šĂ‚Â­ odpor proti platebnĂ„â€šĂ‚Â­mu rozkazu. Text mĂ„â€šĂ‹â€ˇ mĂ„â€šĂ‚Â­t procesnĂ„â€šĂ‚Â­ charakter a musĂ„â€šĂ‚Â­ jasnÄ‚â€žĂ˘â‚¬Ĺź uvĂ„â€šĂ‚Â©st, Ă„Ä…Ă„Äľe je podĂ„â€šĂ‹â€ˇvĂ„â€šĂ‹â€ˇn v zĂ„â€šĂ‹â€ˇkonnĂ„â€šĂ‚Â© lhĂ„Ä…ÄąÂ»tÄ‚â€žĂ˘â‚¬Ĺź. Nejde o odvolĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ ani obecnou nĂ„â€šĂ‹â€ˇmitku.",
      user: "ZdĂ„Ä…ÄąÂ»razni, Ă„Ä…Ă„Äľe jde o odpor, uveÄ‚â€žÄąÄ… identifikaci rozhodnutĂ„â€šĂ‚Â­ a struÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â©, ale konkrĂ„â€šĂ‚Â©tnĂ„â€šĂ‚Â­ odĂ„Ä…ÄąÂ»vodnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­, pokud je v kontextu k dispozici."
    },
    generic: {
      label: "Ă„â€šÄąË‡Ă„Ä…Ă‚ÂEDNĂ„â€šÄąÂ¤ LISTINA",
      system: "Jde o obecnou formĂ„â€šĂ‹â€ˇlnĂ„â€šĂ‚Â­ Ă„â€šÄąĹşĂ„Ä…Ă˘â€žËednĂ„â€šĂ‚Â­ listinu. PiĂ„Ä…Ă‹â€ˇ vÄ‚â€žĂ˘â‚¬ĹźcnÄ‚â€žĂ˘â‚¬Ĺź, pĂ„Ä…Ă˘â€žËehlednÄ‚â€žĂ˘â‚¬Ĺź a bez vymĂ„â€šĂ‹ĹĄĂ„Ä…Ă‹â€ˇlenĂ„â€šĂ‚Â­ skuteÄ‚â€žÄąÂ¤nostĂ„â€šĂ‚Â­.",
      user: "PouĂ„Ä…Ă„Äľij poskytnutĂ„â€šĂ‹ĹĄ kontext a vytvoĂ„Ä…Ă˘â€žË logicky strukturovanĂ„â€šĂ‚Â© podĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ nebo dopis podle jeho obsahu."
    }
  };
  return profiles[type] || profiles.generic;
}

async function callGemini({ prompt, aiContext, recipient, pdfBase64 }) {
  const documentType = detectDocumentType(prompt, aiContext);
  const profile = getDocumentProfile(documentType);

  const systemPrompt = [
    "Jsi pĂ„Ä…Ă˘â€žËesnĂ„â€šĂ‹ĹĄ prĂ„â€šĂ‹â€ˇvnĂ„â€šĂ‚Â­ asistent.",
    `Typ dokumentu: ${profile.label}.`,
    profile.system,
    PDF_RELEVANCE_RULES,
    PDF_IDENTITY_SPLIT_RULES,
    "VytvoĂ„Ä…Ă˘â€žË formĂ„â€šĂ‹â€ˇlnĂ„â€šĂ‚Â­ Ă„â€šÄąĹşĂ„Ä…Ă˘â€žËednĂ„â€šĂ‚Â­ listinu v Ä‚â€žÄąÂ¤eĂ„Ä…Ă‹â€ˇtinÄ‚â€žĂ˘â‚¬Ĺź odpovĂ„â€šĂ‚Â­dajĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ typu dokumentu.",
    "PouĂ„Ä…Ă„Äľij Ă„â€šÄąĹşdaje o odesĂ„â€šĂ‚Â­lateli z pĂ„Ä…Ă˘â€žËiloĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â©ho PDF, pokud jsou Ä‚â€žÄąÂ¤itelnĂ„â€šĂ‚Â©.",
    `PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jemce: ${recipient.nazev}, adresa nebo mÄ‚â€žĂ˘â‚¬Ĺźsto: ${recipient.adresa || recipient.mesto}, datovĂ„â€šĂ‹â€ˇ schrĂ„â€šĂ‹â€ˇnka: ${recipient.ds}.`,
    "NevymĂ„â€šĂ‹ĹĄĂ„Ä…Ă‹â€ˇlej skutkovĂ„â€šĂ‹â€ˇ tvrzenĂ„â€šĂ‚Â­, data ani prĂ„â€šĂ‹â€ˇvnĂ„â€šĂ‚Â­ dĂ„Ä…ÄąÂ»vody, kterĂ„â€šĂ‚Â© nejsou v promptu, kontextu nebo PDF.",
    "Pokud nÄ‚â€žĂ˘â‚¬ĹźkterĂ„â€šĂ‹ĹĄ Ă„â€šÄąĹşdaj chybĂ„â€šĂ‚Â­, napiĂ„Ä…Ă‹â€ˇ text neutrĂ„â€šĂ‹â€ˇlnÄ‚â€žĂ˘â‚¬Ĺź a bez doplĂ„Ä…Ă‚ÂovĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ smyĂ„Ä…Ă‹â€ˇlenĂ„â€šĂ‹ĹĄch detailĂ„Ä…ÄąÂ».",
    "TÄ‚â€žĂ˘â‚¬Ĺźlo listiny musĂ„â€šĂ‚Â­ bĂ„â€šĂ‹ĹĄt vÄ‚â€žĂ˘â‚¬ĹźcnĂ„â€šĂ‚Â©, pĂ„Ä…Ă˘â€žËehlednĂ„â€šĂ‚Â© a pĂ„Ä…Ă˘â€žËizpĂ„Ä…ÄąÂ»sobenĂ„â€šĂ‚Â© konkrĂ„â€šĂ‚Â©tnĂ„â€šĂ‚Â­mu typu podĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­.",
    "VraĂ„Ä…Ă„â€ž pouze validnĂ„â€šĂ‚Â­ JSON bez markdownu.",
    'PouĂ„Ä…Ă„Äľij schĂ„â€šĂ‚Â©ma: {"senderName":"","senderAddress":"","senderBirthDate":"","senderBirthNumber":"","senderIco":"","refData":"","title":"","body":""}'
  ].join(" ");

  const userQuery = [
    `Ă„â€šÄąË‡Ä‚â€žÄąÂ¤el listiny: ${prompt}`,
    `RozpoznanĂ„â€šĂ‹ĹĄ typ listiny: ${profile.label}`,
    `DoplĂ„Ä…Ă‚ÂujĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ pokyn pro tento typ: ${profile.user}`,
    `DoplĂ„Ä…Ă‚ÂujĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ kontext: ${aiContext || "Bez dalĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ho kontextu."}`,
    "TĂ„â€šÄąâ€šn: formĂ„â€šĂ‹â€ˇlnĂ„â€šĂ‚Â­, vÄ‚â€žĂ˘â‚¬ĹźcnĂ„â€šĂ‹ĹĄ, Ă„â€šÄąĹşĂ„Ä…Ă˘â€žËednĂ„â€šĂ‚Â­.",
    "NĂ„â€šĂ‹â€ˇzev listiny dej VELKĂ„â€šÄąÄ„MI PĂ„â€šÄąÂ¤SMENY.",
    "Pokud jde o procesnĂ„â€šĂ‚Â­ podĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­, zakonÄ‚â€žÄąÂ¤i text jasnĂ„â€šĂ‹ĹĄm nĂ„â€šĂ‹â€ˇvrhem nebo petitem odpovĂ„â€šĂ‚Â­dajĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­m danĂ„â€šĂ‚Â©mu typu listiny."
  ].join("\n");

  const parts = [{ text: userQuery }];

  if (pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
  }

  const parsed = await postToGemini({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.15
    }
  });

  return {
    senderName: sanitizeSenderName(parsed.senderName) || "Neuvedeno",
    senderAddress: sanitizeSenderAddress(parsed.senderAddress) || "Neuvedeno",
    senderBirthDate: normalizeText(parsed.senderBirthDate) || "",
    senderBirthNumber: normalizeText(parsed.senderBirthNumber) || "",
    senderIco: normalizeText(parsed.senderIco) || "",
    refData: normalizeText(parsed.refData) || "---",
    title: normalizeText(parsed.title) || profile.label,
    body: normalizeText(parsed.body) || ""
  };
}

async function extractDebtAmountFromPdf(pdfBase64) {
  const parsed = await postToGemini({
    systemInstruction: {
      parts: [{
        text: [
          "Jsi pĂ„Ä…Ă˘â€žËesnĂ„â€šĂ‹ĹĄ extraktor Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ» z prĂ„â€šĂ‹â€ˇvnĂ„â€šĂ‚Â­ch dokumentĂ„Ä…ÄąÂ».",
          PDF_RELEVANCE_RULES,
          "Najdi v PDF dluĂ„Ä…Ă„Äľnou Ä‚â€žÄąÂ¤Ă„â€šĂ‹â€ˇstku nebo vymĂ„â€šĂ‹â€ˇhanou Ä‚â€žÄąÂ¤Ă„â€šĂ‹â€ˇstku.",
          "VraĂ„Ä…Ă„â€ž pouze validnĂ„â€šĂ‚Â­ JSON bez markdownu.",
          'PouĂ„Ä…Ă„Äľij schĂ„â€šĂ‚Â©ma: {"debtAmount":""}'
        ].join(" ")
      }]
    },
    contents: [{ parts: [{ text: "Vyhledej v PDF dluĂ„Ä…Ă„Äľnou Ä‚â€žÄąÂ¤Ă„â€šĂ‹â€ˇstku. VraĂ„Ä…Ă„â€ž ji jako Ä‚â€žÄąÂ¤Ă„â€šĂ‚Â­slo bez mÄ‚â€žĂ˘â‚¬Ĺźny, ideĂ„â€šĂ‹â€ˇlnÄ‚â€žĂ˘â‚¬Ĺź ve formĂ„â€šĂ‹â€ˇtu 12500.50. Pokud ji nenajdeĂ„Ä…Ă‹â€ˇ, vraĂ„Ä…Ă„â€ž prĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ Ă„Ä…Ă˘â€žËetÄ‚â€žĂ˘â‚¬Ĺźzec." }, { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });
  return normalizeText(parsed.debtAmount);
}

async function extractStopExecutionFromPdf(pdfBase64) {
  return await postToGemini({
    systemInstruction: {
      parts: [{
        text: [
          "Jsi extraktor Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ» z exekuÄ‚â€žÄąÂ¤nĂ„â€šĂ‚Â­ch dokumentĂ„Ä…ÄąÂ».",
          PDF_RELEVANCE_RULES,
          "Najdi klĂ„â€šĂ‚Â­Ä‚â€žÄąÂ¤ovĂ„â€šĂ‚Â© Ă„â€šÄąĹşdaje pro nĂ„â€šĂ‹â€ˇvrh na zastavenĂ„â€šĂ‚Â­ exekuce.",
          "VraĂ„Ä…Ă„â€ž pouze validnĂ„â€šĂ‚Â­ JSON bez markdownu.",
          "PouĂ„Ä…Ă„Äľij schĂ„â€šĂ‚Â©ma:",
          '{"exekutor":"","exekutorskyUrad":"","adresaUradu":"","spisovaZnacka":"","opravneny":"","povinny":"","exekucniTitul":"","datumVyzvy":""}'
        ].join(" ")
      }]
    },
    contents: [{ parts: [{ text: "VytÄ‚â€žĂ˘â‚¬ĹźĂ„Ä…Ă„Äľ uvedenĂ„â€šĂ‚Â© Ă„â€šÄąĹşdaje z PDF. Pokud Ă„â€šÄąĹşdaj nenajdeĂ„Ä…Ă‹â€ˇ, vraĂ„Ä…Ă„â€ž prĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ Ă„Ä…Ă˘â€žËetÄ‚â€žĂ˘â‚¬Ĺźzec." }, { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "portal-instituci-local-json", contacts: countAllContacts(), defaultFiles: DATA_FILES.map((p) => path.basename(p)) });
});

app.get("/api/contacts", (req, res) => {
  try {
    const category = req.query.category || "all";
    const q = req.query.q || "";
    const items = getAllContacts(category, q);
    res.json({ ok: true, count: items.length, items });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/import-json", upload.single("jsonDb"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "ChybĂ„â€šĂ‚Â­ JSON soubor." });
    if (!["application/json", "text/plain", ""].includes(req.file.mimetype)) {
      return res.status(400).json({ ok: false, error: "Soubor musĂ„â€šĂ‚Â­ bĂ„â€šĂ‹ĹĄt JSON." });
    }
    const parsed = JSON.parse(req.file.buffer.toString("utf-8"));
    const imported = normalizeContactsFromJson(parsed);
    mergeContacts(imported);
    const importedCount = Object.values(imported).reduce((sum, arr) => sum + arr.length, 0);
    res.json({ ok: true, importedCount, totalCount: countAllContacts(), data: contactStore });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});


app.post("/api/extract-debt", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "ChybĂ„â€šĂ‚Â­ PDF soubor." });
    const debtAmount = await extractDebtAmountFromPdf(req.file.buffer.toString("base64"));
    res.json({ ok: true, debtAmount });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st dluĂ„Ä…Ă„Äľnou Ä‚â€žÄąÂ¤Ă„â€šĂ‹â€ˇstku z PDF." });
  }
});

app.post("/api/extract-stop-execution", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "ChybĂ„â€šĂ‚Â­ PDF soubor." });
    const data = await extractStopExecutionFromPdf(req.file.buffer.toString("base64"));
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Extrakce Ă„â€šÄąĹşdajĂ„Ä…ÄąÂ» z PDF selhala." });
  }
});

app.post("/api/generate", upload.single("pdf"), async (req, res) => {
  try {
    const prompt = normalizeText(req.body.prompt);
    const aiContext = normalizeText(req.body.aiContext);
    const recipientRaw = req.body.recipient;

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ ok: false, error: "Prompt je pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­liĂ„Ä…Ă‹â€ˇ krĂ„â€šĂ‹â€ˇtkĂ„â€šĂ‹ĹĄ." });
    }

    let recipient = {
      nazev: "PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jemce neuveden",
      adresa: "",
      mesto: "",
      ds: ""
    };

    if (recipientRaw) {
      try {
        const parsedRecipient = JSON.parse(recipientRaw);
        recipient = {
          nazev: parsedRecipient?.nazev || "PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jemce neuveden",
          adresa: parsedRecipient?.adresa || "",
          mesto: parsedRecipient?.mesto || "",
          ds: parsedRecipient?.ds || ""
        };
      } catch {
        return res.status(400).json({ ok: false, error: "PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jemce nenĂ„â€šĂ‚Â­ validnĂ„â€šĂ‚Â­ JSON." });
      }
    }

    const result = await callGemini({
      prompt,
      aiContext,
      recipient,
      pdfBase64: req.file ? req.file.buffer.toString("base64") : null
    });

    res.json({ ok: true, document: result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "GenerovĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ selhalo."
    });
  }
});


app.post("/api/export-docx", async (req, res) => {
  try {
    const {
      senderName,
      senderAddress,
      senderBirthDate,
      senderBirthNumber,
      senderIco,
      recipientName,
      recipientAddress,
      refData,
      dateText,
      title,
      body
    } = req.body || {};

    const letterheadTitle = "Osobla\u017esk\u00fd cech, z. \u00fa. - Dluhov\u00e9 a pracovn\u00ed poradenstv\u00ed na Osobla\u017esku";
    const letterheadSubtitle = "Hlinka 25, 793 99 Hlinka | I\u010cO 01937324 | www.osoblazskycech.cz | info@osoblazskycech.cz";

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1700,
                right: 1440,
                bottom: 1440,
                left: 1440
              }
            }
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: letterheadTitle, bold: true, size: 20 })]
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 240 },
                  children: [new TextRun({ text: letterheadSubtitle, size: 18 })]
                })
              ]
            })
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "ODES\u00cdLATEL:", bold: true }),
                new TextRun({ text: ` ${senderName || "---"}` })
              ]
            }),
            new Paragraph(senderAddress || "---"),
            ...(senderBirthDate ? [new Paragraph({ children: [new TextRun({ text: "DATUM NAROZEN\u00cd: ", bold: true }), new TextRun(senderBirthDate)] })] : []),
            ...(senderBirthNumber ? [new Paragraph({ children: [new TextRun({ text: "RODN\u00c9 \u010c\u00cdSLO: ", bold: true }), new TextRun(senderBirthNumber)] })] : []),
            ...(senderIco ? [new Paragraph({ children: [new TextRun({ text: "I\u010cO: ", bold: true }), new TextRun(senderIco)] })] : []),
            new Paragraph(""),
            new Paragraph({
              children: [
                new TextRun({ text: "P\u0158\u00cdJEMCE:", bold: true }),
                new TextRun({ text: ` ${recipientName || "---"}` })
              ]
            }),
            new Paragraph(recipientAddress || "---"),
            new Paragraph(""),
            new Paragraph({
              children: [
                new TextRun({ text: "NA\u0160E \u010c.J.: ", bold: true }),
                new TextRun(refData || "---")
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "DATUM A M\u00cdSTO: ", bold: true }),
                new TextRun(dateText || "---")
              ]
            }),
            new Paragraph(""),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: title || "\u00da\u0158EDN\u00cd LISTINA",
                  bold: true,
                  allCaps: true,
                  size: 28
                })
              ]
            }),
            new Paragraph(""),
            ...(String(body || "")
              .split("\n")
              .map((line) => new Paragraph(line))),
            new Paragraph(""),
            new Paragraph(""),
            new Paragraph("______________________________"),
            new Paragraph("Vlastnoru\u010dn\u00ed podpis")
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    const filename = buildDocxFilenameFromTitle(title);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    res.send(buffer);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Export do DOCX selhal."
    });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

loadContactsFromFiles();
export default app;

// debt_statement profile already injected in previous step
