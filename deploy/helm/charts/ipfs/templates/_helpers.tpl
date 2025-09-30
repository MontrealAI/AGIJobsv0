{{- define "ipfs.fullname" -}}
{{- printf "%s-ipfs" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ipfs.labels" -}}
app.kubernetes.io/name: ipfs
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: ipfs
app.kubernetes.io/managed-by: Helm
{{- end -}}
