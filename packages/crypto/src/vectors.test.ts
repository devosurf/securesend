import { describe, expect, it } from "vitest";
import {
  DecryptionFailedError,
  openEnvelope,
  type StoredEnvelope,
} from "./envelope";
import { decodeFragmentToken } from "./fragment";

/*
 * Two envelopes sealed once by this library and pasted here by hand.
 *
 * Every other test in this package generates its own key and checks the result
 * against itself, so all of them would stay green if the wire format changed
 * underneath. These two would not. They pin the things a sender's link depends
 * on and no local round-trip can catch: the fragment token's byte layout and
 * version, the AAD strings, the HKDF label, the PBKDF2 iterations and hash, the
 * envelope's version and JSON shape, and the base64url spelling of all of it.
 *
 * Links live for up to 72 hours, which is longer than the gap between two
 * deploys. If a change here goes red, it would have silently broken every link
 * already in someone's chat window. Reissue these vectors only together with a
 * version bump that keeps reading the old ones.
 */

const PASSWORD = "correct horse battery staple";

const PLAIN = {
  fragmentToken: "AQAGi7uMCHMlJypnQPA9K3JKrk8_I46yJP4pxP5tOu5y_Q",
  stored: {
    attachments: [
      {
        ciphertext: "1bLGGKJugnmXnnK93SSHW-RnC-2xJZ3VjLwChUlplLURs6q6",
        index: 0,
        iv: "b5FBOmY0XZazgMBg",
      },
      {
        ciphertext:
          "_H1In5HVWgICSYGNyPLQAfWscwqHZn-YJDC9RIHrA_p9e1R23GG7qrLdj2QLa85MmoE",
        index: 1,
        iv: "p6PnZwaOf_VtTLez",
      },
    ],
    envelope: {
      ciphertext:
        "p1c8MGX8sfymchelNjbAytEdtzBMhcePgGZLXgkrBMWvvgrqrM_L98Db8HIbo8Kn5M6URrmUN_W_ZCMPtSIs5MhS2gM0ctB4yCWufOmQC0Wfv1vNv4ZE1Oy4EaTpOyzK_0AkeuS5ujHK6dIQKewOwgrb47pA1-CcZwq6HQ_gqwFN7BJzMTk5WIShLc9Z_n7zeKCGwxXRajkL9fRbPouwteGVhjor8NXudlnvYbmXzB2S3Ir4NLf2G9FXex2Isht-B_WaivlEWWEt9qrDkVoT6uMJqxdzTj2vB5Cct7rZFCcHyB6YPGk5Q-0nBmbCsmOTEQa2cu44UcgP6fsP4fQA0b_raIMqmITIQgC4jaVXjOJBAhaDTBg",
      iv: "OJA7oSyfCqIMSEGe",
    },
    id: "BVTaHyDax-92pPlnMz_F5w",
  },
} satisfies { fragmentToken: string; stored: StoredEnvelope };

const WITH_PASSWORD = {
  fragmentToken:
    "AQGIYl3TRIqOm0PGKG7daObWgZ08pNYqBYFg-TpO6bIV1WrZgNFvhg_xPb2bPAOYkAA",
  stored: {
    attachments: [
      {
        ciphertext: "76lscR8eI8d1ACAEkqtpZ8MJ86OjH1VC38g95JJvlRkzRz-L",
        index: 0,
        iv: "1TWE138lUTdexagG",
      },
      {
        ciphertext:
          "Od-nH5h-KAAm3uUF-hP5yuNhw14WFtz42tEgWD3f19dkGI_myMVQlbSLYL9IaWw5yuA",
        index: 1,
        iv: "944Dy1EF86gJsbLB",
      },
    ],
    envelope: {
      ciphertext:
        "JjuGBQSCIRC2Vkm37T8CbSp1Y4Zb1F-FCoitAx-Enl8Hkj291bmXsOEpzEBo2qgT5pCfI272mAAtqPjy1Pg4AXVljSXIzql2uM0CAg1co_Vk9IAG_Q4ULFIwDXf2VEXOPxmggl0f8K0aoBnEC95VWGfzJyEnpLaNXGrNyDuFuNDJhezM1IhXRJMOyc0JhwI49EK2Q13zAgcbvZ38YSwnpm0CvXSxffuESWYJtxhJB1biaxQvk2QnAGsijzmsWIi5OsL7IVA7-BAdqPhQX4lxCY4963Z-IlzTcfjzKYdb01xGA2y9u477U5vdGAaBt26sK1gcFTR6Y86fUV-vJEhIJGRBrA7rnwc-aMlj8w703OQ5iI2FdNw",
      iv: "e-hocZx13lx7PI9g",
    },
    id: "fpPc3CjEAp_RFpHiQMSFxQ",
  },
} satisfies { fragmentToken: string; stored: StoredEnvelope };

/** What both vectors were sealed over. */
const CONTENTS = {
  credentials: { password: "hunter2-Ω-åäö", username: "svc-deploy" },
  files: [
    {
      body: "111111 222222 333333",
      name: "recovery-codes.txt",
      type: "text/plain",
    },
    {
      body: "remote vpn.example 1194\nproto udp\n",
      name: "office.ovpn",
      type: "application/x-openvpn-profile",
    },
  ],
  note: "vpn is up, rotate this by friday",
};

function expected() {
  return {
    credentials: CONTENTS.credentials,
    files: CONTENTS.files.map((source) => ({
      bytes: new TextEncoder().encode(source.body),
      name: source.name,
      size: new TextEncoder().encode(source.body).length,
      type: source.type,
    })),
    note: CONTENTS.note,
  };
}

function open(vector: typeof PLAIN | typeof WITH_PASSWORD, password?: string) {
  const result = decodeFragmentToken(vector.fragmentToken);

  if (result.status !== "ok") {
    throw new Error("a frozen token stopped decoding");
  }

  return openEnvelope({ password, stored: vector.stored, token: result.token });
}

describe("frozen vectors", () => {
  it("opens an envelope with no password", async () => {
    expect(await open(PLAIN)).toStrictEqual(expected());
  });

  it("opens an envelope with a password", async () => {
    expect(await open(WITH_PASSWORD, PASSWORD)).toStrictEqual(expected());
  });

  it("still refuses the wrong password on a real envelope", async () => {
    await expect(
      open(WITH_PASSWORD, "correct horse battery stapl")
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("holds the token lengths a secret link is designed around", () => {
    expect(PLAIN.fragmentToken).toHaveLength(46);
    expect(WITH_PASSWORD.fragmentToken).toHaveLength(67);
    expect(PLAIN.stored.id).toHaveLength(22);
  });
});
