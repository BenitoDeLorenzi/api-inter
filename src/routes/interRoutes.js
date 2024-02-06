const express = require("express");
const router = express.Router();
const axios = require("axios");
const qs = require("qs");
const fs = require("fs");
const path = require("path");
const https = require("https");

const certPath = path.resolve(__dirname, "../../cert/certificado.crt");
const keyPath = path.resolve(__dirname, "../../cert/chave.key");

const httpsAgent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
});

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
            scope: "boleto-cobranca.read boleto-cobranca.write",
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

router.post("/getBoletos", async (req, res) => {
    const params = req.body.params;
    let tokenResponse;
    let token;

    const makeRequest = async () => {
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
            res.json({ dados: response.data, token: tokenResponse });
        } catch (error) {
            console.error("Erro na requisição:", error.message);

            // Check if the error is due to an expired token
            if (error.response && error.response.status === 401) {
                console.log(
                    "Token expirado, obtendo um novo token e tentando novamente"
                );
                try {
                    tokenResponse = await getTokenBoletos();
                    token = "Bearer " + tokenResponse.access_token;
                    await makeRequest(); // Retry the request with the new token
                } catch (retryError) {
                    console.error(
                        "Erro ao tentar novamente:",
                        retryError.message
                    );
                    res.status(500).send(
                        "Erro ao obter boletos após a tentativa de renovação do token"
                    );
                }
            } else {
                // If the error is not due to token expiration, send an error response
                res.status(500).send("Erro ao obter boletos");
            }
        }
    };

    try {
        if (params.tokenExpired) {
            tokenResponse = await getTokenBoletos();
            token = "Bearer " + tokenResponse.access_token;
            console.log("Pegando novo token");
        } else {
            tokenResponse = params.token;
            token = "Bearer " + params.token.access_token;
            console.log("Pegando do localstogare");
        }

        await makeRequest();
    } catch (error) {
        console.error("Erro na obtenção do token:", error.message);
        res.status(500).send("Erro interno do servidor");
    }
});

router.get("/teste", (req, res) => {
    res.send("Inter app teste");
});

module.exports = router;
