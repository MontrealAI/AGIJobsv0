{{- define "graphNode.fullname" -}}
{{- printf "%s-%s" .Release.Name "graph-node" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
