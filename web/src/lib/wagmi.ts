import { createConfig, fallback, http, webSocket } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, ARC_RPC_URL, ARC_WSS_URL } from "./chain";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: fallback([webSocket(ARC_WSS_URL), http(ARC_RPC_URL)]),
  },
  connectors: [injected({ shimDisconnect: true })],
  ssr: true,
});
