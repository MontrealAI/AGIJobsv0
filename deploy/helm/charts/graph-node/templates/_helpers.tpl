{{- define "graph-node.fullname" -}}
{{- printf "%s-graph-node" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "graph-node.labels" -}}
app.kubernetes.io/name: graph-node
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: graph-node
app.kubernetes.io/managed-by: Helm
{{- end -}}
