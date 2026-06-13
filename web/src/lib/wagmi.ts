import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, ARC_RPC_URL } from "./chain";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(ARC_RPC_URL),
  },
  connectors: [injected({ shimDisconnect: true })],
  ssr: true,
});
