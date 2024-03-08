const express = require("express");
const router = express.Router();
const axios = require("axios");
const qs = require("qs");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { PDFDocument, rgb, componentsToColor } = require("pdf-lib");

const certPath = path.resolve(__dirname, "../../cert/certificado.crt");
const keyPath = path.resolve(__dirname, "../../cert/chave.key");

const httpsAgent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
});

const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const { storage } = require("../services/firebaseConnection");

function flattenParams(obj, parentKey = "", result = {}) {
    for (let [key, value] of Object.entries(obj)) {
        if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        ) {
            flattenParams(value, `${parentKey}${key}.`, result);
        } else {
            result[parentKey + key] = value;
        }
    }
    return result;
}

const getTokenBoletos = async () => {
    try {
        const data = qs.stringify({
            client_id: "6dc5bb3f-0bdc-4de6-b96d-7fe9b1f1fa1e",
            client_secret: "147d5626-51c6-499b-86d9-0708aecb259b",
            scope: "boleto-cobranca.read boleto-cobranca.write extrato.read",
            grant_type: "client_credentials",
        });

        const response = await axios.post(
            "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
            data,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                httpsAgent: httpsAgent,
            }
        );

        return response.data;
    } catch (error) {
        console.log(error);
    }
};

router.post("/getToken", async (req, res) => {
    const response = await getTokenBoletos();
    res.json(response);
});

router.post("/getBoletos", async (req, res) => {
    const params = req.body.params;
    const token = "Bearer " + params.token.access_token;

    try {
        const queryString = new URLSearchParams(
            flattenParams(params.dados)
        ).toString();
        const url = `https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas?${queryString}`;
        const config = {
            method: "get",
            url: url,
            headers: {
                Authorization: token,
            },
            httpsAgent: httpsAgent,
        };

        const response = await axios(config);
        res.json({ dados: response.data });
    } catch (error) {
        console.error("Erro na requisição:", error.message);
    }
});

router.post("/getSumario", async (req, res) => {
    const dados = req.body.dados;
    const token = "Bearer " + req.body.token.access_token;

    try {
        const queryString = new URLSearchParams(
            flattenParams(dados)
        ).toString();
        const url = `https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/sumario?${queryString}`;
        const config = {
            method: "get",
            url: url,
            headers: {
                Authorization: token,
            },
            httpsAgent: httpsAgent,
        };

        const response = await axios(config);
        res.json({ dados: response.data });
    } catch (error) {
        console.error("Erro na requisição:", error.message);
        res.json({ error: error.message });
    }
});

async function mergePDFsBase64(pdfBase64Array, fileName) {
    try {
        const mergedPdf = await PDFDocument.create();

        for (const pdfBase64 of pdfBase64Array) {
            const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) =>
                c.charCodeAt(0)
            );
            const pdf = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(
                pdf,
                pdf.getPageIndices()
            );
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const storageRef = ref(storage, `pdfs/${fileName}`);
        const uploadTask = uploadBytes(storageRef, mergedPdfBytes);
        const snapshot = await uploadTask;

        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("DownloadUrl: " + downloadURL);
        return downloadURL;
    } catch (error) {
        console.error(
            "Erro ao mesclar e enviar PDF para o Firebase Storage:",
            error
        );
        throw error; // Re-lança o erro para que o chamador da função possa lidar com ele
    }
}

router.post("/getPdf", async (req, res) => {
    const codigoSolicitacao = req.body.codigoSolicitacao;
    const token = "Bearer " + req.body.token.access_token;
    const fileName = req.body.fileName;

    let result = [];

    for (let i = 0; i < codigoSolicitacao.length; i++) {
        let url;
        const element = codigoSolicitacao[i];

        if (element.includes("-")) {
            url = `https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/${element}/pdf`;
        } else {
            url = `https://cdpj.partners.bancointer.com.br/cobranca/v2/boletos/${element}/pdf`;
        }

        try {
            const config = {
                method: "get",
                url: url,
                headers: {
                    Authorization: token,
                },
                httpsAgent: httpsAgent,
            };

            const response = await axios(config);

            result.push(response.data.pdf);
            console.log(
                "Baixando pdf " + (i + 1) + "/" + codigoSolicitacao.length
            );
        } catch (error) {
            result.push(error.response ? error.response.data : error.message);
            console.error("Erro na requisição:", error.message);
            result.push("");
        }
    }

    try {
        const fileUrl = await mergePDFsBase64(result, fileName);
        res.json({ link: fileUrl });
    } catch (error) {
        console.error("Erro ao mesclar PDFs:", error.message);
        res.status(500).send("Erro ao mesclar PDFs");
    }
});

router.post("/enviarBoleto", async (req, res) => {
    const dados = req.body.params;
    const token = "Bearer " + req.body.token.access_token;
    const instance = axios.create({
        httpsAgent: httpsAgent,
    });
    const url =
        "https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas?";

    const headers = {
        Authorization: token,
        "x-conta-corrente": "285923498",
        "Content-Type": "application/json",
        Accept: "application/json",
    };

    instance
        .post(url, dados, { headers: headers })
        .then((response) => {
            console.log(
                "Boleto " +
                    dados.seuNumero +
                    " gerado com sucesso: " +
                    response.data.codigoSolicitacao
            );
            res.send(response.data);
        })
        .catch((error) => {
            console.error(
                "Erro na requisição:",
                error.response ? error.response.data : error.message
            );
            res.status(error.response ? error.response.status : 500).send(
                error.response ? error.response.data : error.message
            );
        });
});

router.post("/cancelarBoleto", (req, res) => {
    const nossoNumero = req.body.nossoNumero;
    const codigoSolicitacao = req.body.codigoSolicitacao;
    const motivo = req.body.motivo;
    const token = "Bearer " + req.body.token.access_token;
    const instance = axios.create({
        httpsAgent: httpsAgent,
    });

    let url;

    if (codigoSolicitacao) {
        url = `https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/${codigoSolicitacao}/cancelar`;
    } else {
        url = `https://cdpj.partners.bancointer.com.br/cobranca/v2/boletos/${nossoNumero}/cancelar`;
    }

    instance
        .post(
            url,
            { motivoCancelamento: motivo },
            {
                headers: {
                    Authorization: token,
                    "Content-Type": "application/json",
                },
            }
        )
        .then((response) => {
            console.log(
                "Boleto: " + codigoSolicitacao
                    ? nossoNumero
                    : codigoSolicitacao + " cancelado com sucesso"
            );
            res.send(true);
        })
        .catch((error) => {
            console.log(
                "Boleto: " + codigoSolicitacao
                    ? nossoNumero
                    : codigoSolicitacao + " erro ao cancelar"
            );
            res.send(false);
        });
});

router.get("/teste", (req, res) => {
    res.send("Teste api");
});

module.exports = router;
