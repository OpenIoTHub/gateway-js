import QRCode from 'qrcode';

const GATEWAY_QR_BY_ID_TEMPLATE = 'https://iothub.cloud/a/g?id=%s';
const GATEWAY_QR_BY_ID_AND_HOST_TEMPLATE = 'https://iothub.cloud/a/g?id=%s&host=%s';
export const STD_HOST = 'guonei.servers.iothub.cloud';

export function getQrContentById(id: string): string {
  return GATEWAY_QR_BY_ID_TEMPLATE.replace('%s', id);
}

export function getQrContentByIdAndHost(id: string, host: string): string {
  return GATEWAY_QR_BY_ID_AND_HOST_TEMPLATE
    .replace('%s', id)
    .replace('%s', host);
}

export function displayQRCodeById(id: string, host: string): void {
  let qrContent: string;
  if (!host || host === STD_HOST) {
    qrContent = getQrContentById(id);
  } else {
    qrContent = getQrContentByIdAndHost(id, host);
  }

  console.log(`Use OpenIoTHub to scan the following QR code and add a gateway(${id})`);

  QRCode.toString(qrContent, { type: 'terminal', small: true }, (err, str) => {
    if (!err && str) {
      console.log(str);
    } else {
      console.log(`QR content: ${qrContent}`);
    }
  });

  console.log(
    'If the above QR code cannot be scanned, please open the following link and scan the QR code in page:',
  );
  if (!host || host === STD_HOST) {
    console.log(
      `https://api.iot-manager.iothub.cloud/v1/displayGatewayQRCodeById?id=${id}`,
    );
  } else {
    console.log(
      `https://api.iot-manager.iothub.cloud/v1/displayGatewayQRCodeById?id=${id}&host=${host}`,
    );
  }
}
