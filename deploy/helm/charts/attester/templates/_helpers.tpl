{{- define "attester.fullname" -}}
{{- printf "%s-%s" .Release.Name "attester" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
