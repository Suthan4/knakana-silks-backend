import axios from "axios";

const MSG91_BASE_URL = "https://control.msg91.com/api/v5/otp";

function getConfig() {
  const authKey = process.env.MSG91_AUTHKEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  if (!authKey || !templateId) {
    throw new Error("MSG91 is not configured. Set MSG91_AUTHKEY and MSG91_OTP_TEMPLATE_ID.");
  }
  return { authKey, templateId };
}

function normalizeIndianMobile(value: string): string {
  const digits = value.replace(/\\D/g, "");
  const mobile = digits.startsWith("91") && digits.length === 12 ? digits : digits.length === 10 ? `91${digits}` : "";
  if (!/^91[6-9]\\d{9}$/.test(mobile)) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }
  return mobile;
}

export class Msg91OtpService {
  async send(mobileInput: string) {
    const { authKey, templateId } = getConfig();
    const mobile = normalizeIndianMobile(mobileInput);
    const response = await axios.post(
      MSG91_BASE_URL,
      {},
      {
        params: { template_id: templateId, mobile, otp_length: 6, otp_expiry: 5 },
        headers: { authkey: authKey, "Content-Type": "application/json" },
        timeout: 10000,
      },
    );
    if (response.data?.type !== "success" || !response.data?.request_id) {
      throw new Error(response.data?.message || "Unable to send OTP. Please try again.");
    }
    return { mobile, requestId: response.data.request_id };
  }

  async verify(mobileInput: string, otpInput: string) {
    const { authKey } = getConfig();
    const mobile = normalizeIndianMobile(mobileInput);
    const otp = otpInput.trim();
    if (!/^\\d{6}$/.test(otp)) throw new Error("Enter the 6-digit OTP.");
    const response = await axios.get(`${MSG91_BASE_URL}/verify`, {
      params: { mobile, otp },
      headers: { authkey: authKey },
      timeout: 10000,
    });
    if (response.data?.type !== "success") {
      throw new Error(response.data?.message || "Invalid or expired OTP.");
    }
    return { mobile };
  }

  async resend(mobileInput: string) {
    const { authKey } = getConfig();
    const mobile = normalizeIndianMobile(mobileInput);
    const response = await axios.get(`${MSG91_BASE_URL}/retry`, {
      params: { mobile, retrytype: "text" },
      headers: { authkey: authKey },
      timeout: 10000,
    });
    if (response.data?.type !== "success") {
      throw new Error(response.data?.message || "Unable to resend OTP.");
    }
    return { mobile };
  }
}
