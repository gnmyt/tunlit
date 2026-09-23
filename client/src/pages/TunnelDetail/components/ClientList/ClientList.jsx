import "./styles.sass";
import Button from "@/common/components/Button";
import { formatRelative } from "@/common/utils/formatUtils.js";
import { Unplug, Users } from "lucide-react";

export const ClientList = ({ clients = [], port, heading, onDisconnect, onDisconnectAll }) => (
    <section className="clients">
        <div className="clients-head">
            {heading}
            <span className="clients-count">{clients.length} connected</span>
            <div className="clients-spacer" />
            {clients.length > 0 && <Button type="ghost" text="Disconnect all" buttonType="button"
                                           onClick={onDisconnectAll} />}
        </div>

        {clients.length === 0
            ? <div className="clients-empty">
                <Users size={20} />
                <p>Nobody is connected.</p>
            </div>
            : <div className="clients-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Client IP</th>
                            <th>Connected</th>
                            <th>Open connections</th>
                            <th>Forwarding</th>
                            <th aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((client, index) => (
                            <tr key={`${client.ip}-${client.connectedAt}-${index}`}>
                                <td className="mono">{client.ip || "-"}</td>
                                <td className="dim">{client.connectedAt ? formatRelative(client.connectedAt) : "-"}</td>
                                <td className="mono">{client.streams}</td>
                                <td className="mono dim">{port} tcp+udp</td>
                                <td className="clients-actions">
                                    <Button type="danger" icon={Unplug} title="Disconnect"
                                            buttonType="button" onClick={() => onDisconnect(client)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>}
    </section>
);
